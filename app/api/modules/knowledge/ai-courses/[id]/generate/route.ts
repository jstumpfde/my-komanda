import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { aiCourseProjects, aiUsageLog } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

interface Source {
  type: "article" | "video" | "file" | "text"
  title: string
  content: string
  url?: string
}

interface Params {
  audience?: string
  format?: string
  tone?: string
  withTests?: boolean
  withSummary?: boolean
}

// ─── YouTube transcript ──────────────────────────────────────────────────────

async function fetchTranscript(url: string): Promise<string> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const transcript = await YoutubeTranscript.fetchTranscript(url)
    return transcript.map((t: { text: string }) => t.text).join(" ")
  } catch {
    return `[YouTube видео: ${url} — субтитры недоступны]`
  }
}

// ─── Mock course ─────────────────────────────────────────────────────────────

function getMockResult(params: Params, sourceCount: number) {
  const isMini = params.format === "mini"
  const isFull = params.format === "full"
  const count = isMini ? 4 : isFull ? 15 : 8
  const dur = isMini ? 4 : isFull ? 18 : 12

  const lessons = Array.from({ length: count }, (_, i) => ({
    title: ["Введение", "Основные понятия", "Практическое применение", "Типичные ошибки",
      "Инструменты", "Продвинутые техники", "Кейсы", "Итоги",
      "Методология", "Командная работа", "Оценка результатов", "Стратегия",
      "Автоматизация", "Масштабирование", "Итоговый обзор"][i % 15],
    content_markdown: `## ${["Введение", "Основные понятия", "Практика", "Ошибки", "Инструменты", "Техники", "Кейсы", "Итоги"][i % 8]}\n\nСодержание урока на основе ${sourceCount} источников.\n\n### Ключевые тезисы\n- Тезис первый\n- Тезис второй\n- Тезис третий`,
    duration_minutes: dur + Math.floor(Math.random() * 5),
    test: params.withTests !== false ? {
      questions: [
        { question: `Вопрос 1 к уроку ${i + 1}?`, options: ["Вариант А", "Вариант Б (верный)", "Вариант В", "Вариант Г"], correct_index: 1 },
        { question: `Вопрос 2 к уроку ${i + 1}?`, options: ["Способ 1", "Способ 2", "Способ 3 (верный)", "Способ 4"], correct_index: 2 },
      ],
    } : undefined,
  }))

  if (isFull) {
    return {
      title: "Полный курс обучения",
      description: "Комплексный курс, созданный AI на основе предоставленных материалов.",
      modules: [
        { title: "Модуль 1: Основы", description: "Базовые знания", lessons: lessons.slice(0, 5) },
        { title: "Модуль 2: Практика", description: "Применение", lessons: lessons.slice(5, 10) },
        { title: "Модуль 3: Продвинутый", description: "Углублённое изучение", lessons: lessons.slice(10) },
      ],
    }
  }

  return {
    title: "Курс на основе материалов",
    description: "Структурированный курс, созданный AI на основе предоставленных материалов.",
    modules: [{ title: "Основной модуль", description: "", lessons }],
  }
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  // Get project
  const [project] = await db.select().from(aiCourseProjects)
    .where(and(eq(aiCourseProjects.id, id), eq(aiCourseProjects.tenantId, user.companyId)))

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sources = (project.sources as Source[]) || []
  const params = (project.params as Params) || {}

  if (sources.length === 0) {
    return NextResponse.json({ error: "Добавьте хотя бы один источник" }, { status: 400 })
  }

  // Update status → generating
  await db.update(aiCourseProjects).set({ status: "generating", updatedAt: new Date() }).where(eq(aiCourseProjects.id, id))

  try {
    // Collect texts
    const allTexts: string[] = []
    for (const src of sources) {
      if (src.type === "video" && src.url) {
        const transcript = await fetchTranscript(src.url)
        allTexts.push(`[Видео: ${src.title}]\n${transcript}`)
      } else if (src.content) {
        allTexts.push(`[${src.title}]\n${src.content}`)
      }
    }

    const combinedText = allTexts.join("\n\n---\n\n")
    const inputTokensEstimate = Math.ceil(combinedText.length / 4)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Mock mode
      const mockResult = getMockResult(params, sources.length)
      const mockInputTokens = inputTokensEstimate
      const mockOutputTokens = 2000
      const mockCost = ((mockInputTokens * 3 + mockOutputTokens * 15) / 1_000_000).toFixed(4)

      await db.update(aiCourseProjects).set({
        result: mockResult,
        status: "ready",
        tokensInput: mockInputTokens,
        tokensOutput: mockOutputTokens,
        costUsd: mockCost,
        updatedAt: new Date(),
      }).where(eq(aiCourseProjects.id, id))

      await db.insert(aiUsageLog).values({
        tenantId: user.companyId,
        userId: (user as { id?: string }).id || null,
        action: "course_generate",
        projectId: id,
        inputTokens: mockInputTokens,
        outputTokens: mockOutputTokens,
        model: "mock",
        costUsd: mockCost,
      })

      return NextResponse.json(mockResult)
    }

    // Build prompt
    const formatHint = params.format === "mini" ? "3-5 уроков по 3-5 мин" : params.format === "full" ? "15-25 уроков по 15-20 мин в 3-5 модулях" : "8-12 уроков по 10-15 мин"
    const toneHint = params.tone === "formal" ? "формальный деловой" : params.tone === "gamified" ? "игровой вовлекающий" : "дружелюбный понятный"
    const audienceMap: Record<string, string> = { new_employees: "новых сотрудников", line_staff: "линейного персонала", managers: "менеджеров", executives: "руководителей", all: "всех сотрудников" }

    const prompt = `Создай обучающий курс на основе материалов.

Аудитория: ${audienceMap[params.audience ?? "all"] ?? "всех сотрудников"}
Формат: ${formatHint}
Тон: ${toneHint}
${params.withTests !== false ? "Генерируй 2-3 тестовых вопроса после каждого урока." : "Без тестов."}
${params.withSummary ? "Добавь конспект в начало каждого урока." : ""}

Материалы (${sources.length} источников):
${combinedText.slice(0, 12000)}

Верни ТОЛЬКО валидный JSON:
{"title":"...","description":"...","modules":[{"title":"...","description":"...","lessons":[{"title":"...","content_markdown":"...","duration_minutes":15,"test":{"questions":[{"question":"...","options":["А","Б","В","Г"],"correct_index":0}]}}]}]}

Язык: русский. Контент основан строго на материалах.`

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: "Ты эксперт по созданию корпоративных обучающих курсов. На основе предоставленных материалов создай структурированный курс. Отвечай ТОЛЬКО валидным JSON без markdown.",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text())
      const mockResult = getMockResult(params, sources.length)
      await db.update(aiCourseProjects).set({ result: mockResult, status: "ready", updatedAt: new Date() }).where(eq(aiCourseProjects.id, id))
      return NextResponse.json(mockResult)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ""
    const usage = data.usage || {}
    const inputTokens = usage.input_tokens || inputTokensEstimate
    const outputTokens = usage.output_tokens || 2000
    const cost = ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(4)

    let result
    try {
      const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()
      result = JSON.parse(cleaned)
      if (!result.modules && result.lessons) {
        result.modules = [{ title: "Основной модуль", description: "", lessons: result.lessons }]
      }
    } catch {
      result = getMockResult(params, sources.length)
    }

    await db.update(aiCourseProjects).set({
      result,
      status: "ready",
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      costUsd: cost,
      updatedAt: new Date(),
    }).where(eq(aiCourseProjects.id, id))

    await db.insert(aiUsageLog).values({
      tenantId: user.companyId,
      userId: (user as { id?: string }).id || null,
      action: "course_generate",
      projectId: id,
      inputTokens,
      outputTokens,
      model: "claude-sonnet-4-20250514",
      costUsd: cost,
    })

    return NextResponse.json(result)
  } catch (error) {
    await db.update(aiCourseProjects).set({ status: "draft", updatedAt: new Date() }).where(eq(aiCourseProjects.id, id))
    console.error("Generate error:", error)
    return NextResponse.json({ error: "Ошибка генерации" }, { status: 500 })
  }
}
