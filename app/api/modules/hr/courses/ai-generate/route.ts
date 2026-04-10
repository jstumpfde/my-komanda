import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string
  options: string[]
  correct: number
}

interface GeneratedLesson {
  title: string
  content: string
  duration_minutes: number
  has_quiz: boolean
  quiz_questions: QuizQuestion[]
}

interface GeneratedModule {
  title: string
  description: string
  lessons: GeneratedLesson[]
}

interface GeneratedCourse {
  title: string
  description: string
  category: string
  difficulty: string
  modules: GeneratedModule[]
  // flat lessons for backwards compat
  lessons?: GeneratedLesson[]
}

interface GenerateRequest {
  // Legacy single-file mode
  text?: string
  filename?: string
  // Multi-source mode
  articleIds?: string[]
  videoUrls?: string[]
  texts?: string[]
  fileNames?: string[]
  params?: {
    title?: string
    audience?: string
    format?: string
    tone?: string
    withTests?: boolean
    withSummary?: boolean
  }
}

// ─── YouTube transcript extraction ───────────────────────────────────────────

async function fetchYoutubeTranscript(url: string): Promise<string> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const transcript = await YoutubeTranscript.fetchTranscript(url)
    return transcript.map((t: { text: string }) => t.text).join(" ")
  } catch (e) {
    console.warn("Failed to fetch YouTube transcript for:", url, e)
    return `[YouTube видео: ${url} — субтитры недоступны]`
  }
}

// ─── Mock article content ────────────────────────────────────────────────────

const MOCK_ARTICLE_CONTENT: Record<string, string> = {
  "1": "Как оформить отпуск. Заявление подаётся за 14 дней. Виды отпуска: ежегодный оплачиваемый, без сохранения ЗП, учебный, декретный. Порядок согласования: непосредственный руководитель → HR → приказ. Выплата отпускных за 3 дня до начала.",
  "2": "Настройка VPN. Шаг 1: получите учётные данные в IT-отделе. Шаг 2: скачайте клиент WireGuard. Шаг 3: импортируйте конфигурацию. Шаг 4: подключитесь и проверьте доступ к внутренним ресурсам.",
  "3": "Скрипт холодного звонка v2. Приветствие → Квалификация → Презентация ценности → Работа с возражениями → Назначение встречи. Ключевые фразы и примеры для каждого этапа.",
  "4": "Чек-лист первого дня. Получить пропуск. Настроить рабочее место. Установить корпоративные приложения. Знакомство с командой. Обед с наставником. Изучить внутреннюю wiki.",
  "5": "Как заказать канцтовары. Зайти в раздел Заявки. Выбрать из каталога. Согласовать с руководителем. Срок поставки — 3-5 рабочих дней.",
  "6": "Работа с CRM. Создание сделки, этапы воронки, карточка клиента, задачи и напоминания, отчёты по продажам.",
  "7": "Пароли и двухфакторная защита. Требования к паролям: минимум 12 символов, буквы, цифры, спецсимволы. 2FA обязательна для всех сотрудников. Используем Google Authenticator.",
  "8": "Обработка возражений. Типовые возражения: дорого, подумаю, не нужно, есть поставщик. Техники: присоединение, уточнение, аргументация, закрытие.",
  "9": "Структура компании. Генеральный директор → Директора направлений → Руководители отделов → Специалисты. Схема подчинения и зоны ответственности.",
  "10": "KPI и бонусы. Система квартальных KPI. Формула расчёта бонуса. Градация выполнения: <80% — нет бонуса, 80-100% — пропорционально, >100% — повышенный коэффициент.",
}

// ─── Mock course generator ───────────────────────────────────────────────────

function getMockCourse(params?: GenerateRequest["params"], sourceCount?: number): GeneratedCourse {
  const title = params?.title || "Курс на основе загруженных материалов"
  const isMinI = params?.format === "mini"
  const isFull = params?.format === "full"

  const lessonCount = isMinI ? 4 : isFull ? 16 : 8
  const lessonDuration = isMinI ? 4 : isFull ? 18 : 12

  const lessons: GeneratedLesson[] = Array.from({ length: lessonCount }, (_, i) => ({
    title: `Урок ${i + 1}: ${["Введение в тему", "Основные понятия", "Практика", "Работа с инструментами", "Типичные ошибки", "Продвинутые техники", "Кейсы из практики", "Финальный обзор", "Углублённый разбор", "Методология", "Командная работа", "Оценка результатов", "Стратегия", "Автоматизация", "Масштабирование", "Итоги и следующие шаги"][i % 16]}`,
    content: `## Урок ${i + 1}\n\nСодержание урока, сгенерированное на основе ${sourceCount ?? 1} источников.\n\n### Ключевые тезисы\n- Тезис 1\n- Тезис 2\n- Тезис 3\n\n### Практическое задание\nПрименить полученные знания на рабочем примере.`,
    duration_minutes: lessonDuration + Math.floor(Math.random() * 5),
    has_quiz: params?.withTests !== false,
    quiz_questions: params?.withTests !== false ? [
      {
        question: `Что является ключевым выводом урока ${i + 1}?`,
        options: ["Вариант А", "Вариант Б (правильный)", "Вариант В", "Вариант Г"],
        correct: 1,
      },
      {
        question: `Как применить знания из урока ${i + 1} на практике?`,
        options: ["Способ 1", "Способ 2", "Способ 3 (правильный)", "Способ 4"],
        correct: 2,
      },
    ] : [],
  }))

  // Split into modules for full format
  if (isFull) {
    const mod1 = lessons.slice(0, 5)
    const mod2 = lessons.slice(5, 11)
    const mod3 = lessons.slice(11)
    return {
      title,
      description: "Полный курс, созданный AI на основе предоставленных материалов. Включает модули, уроки и тесты.",
      category: "onboarding",
      difficulty: "intermediate",
      modules: [
        { title: "Модуль 1: Основы", description: "Базовые знания и понятия", lessons: mod1 },
        { title: "Модуль 2: Практика", description: "Практическое применение", lessons: mod2 },
        { title: "Модуль 3: Продвинутый уровень", description: "Углублённое изучение", lessons: mod3 },
      ],
    }
  }

  return {
    title,
    description: "Курс создан AI на основе предоставленных материалов. Включает теорию, практику и проверочные тесты.",
    category: "onboarding",
    difficulty: "beginner",
    modules: [{ title: "Основной модуль", description: "", lessons }],
  }
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body: GenerateRequest = await req.json()

    // Collect all text content
    const allTexts: string[] = []

    // Legacy single-text mode
    if (body.text) {
      allTexts.push(body.text)
    }

    // Article content
    if (body.articleIds?.length) {
      for (const id of body.articleIds) {
        const content = MOCK_ARTICLE_CONTENT[id]
        if (content) allTexts.push(content)
      }
    }

    // YouTube transcripts
    if (body.videoUrls?.length) {
      for (const url of body.videoUrls) {
        const transcript = await fetchYoutubeTranscript(url)
        allTexts.push(transcript)
      }
    }

    // Pasted texts
    if (body.texts?.length) {
      allTexts.push(...body.texts.filter(Boolean))
    }

    // File names (in real app, files would be uploaded and parsed)
    if (body.fileNames?.length) {
      for (const name of body.fileNames) {
        allTexts.push(`[Содержимое файла: ${name}]`)
      }
    }

    if (allTexts.length === 0) {
      return NextResponse.json({ error: "Нет материалов для генерации" }, { status: 400 })
    }

    const combinedText = allTexts.join("\n\n---\n\n")
    const params = body.params
    const sourceCount = (body.articleIds?.length ?? 0) + (body.videoUrls?.length ?? 0) + (body.texts?.length ?? 0) + (body.fileNames?.length ?? 0)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY не задан, возвращаем демо-структуру курса")
      return NextResponse.json(getMockCourse(params, sourceCount || 1))
    }

    // Build prompt
    const formatHint = params?.format === "mini"
      ? "3-5 коротких уроков по 3-5 минут. Один модуль."
      : params?.format === "full"
      ? "15-25 уроков по 15-20 минут, разбитых на 3-5 модулей."
      : "8-12 уроков по 10-15 минут. 1-2 модуля."

    const toneHint = params?.tone === "formal"
      ? "формальный, деловой стиль"
      : params?.tone === "gamified"
      ? "игровой, вовлекающий стиль с геймификацией"
      : "дружелюбный, понятный стиль"

    const audienceHint = {
      new_employees: "новых сотрудников",
      line_staff: "линейного персонала",
      managers: "менеджеров среднего звена",
      executives: "руководителей",
      all: "всех сотрудников компании",
    }[params?.audience ?? "all"] ?? "всех сотрудников"

    const prompt = `Создай структурированный обучающий курс на основе следующих материалов.

${params?.title ? `Название курса: "${params.title}"` : "Придумай подходящее название для курса."}

Целевая аудитория: ${audienceHint}
Формат: ${formatHint}
Тон: ${toneHint}
${params?.withTests !== false ? "Генерируй 2-3 тестовых вопроса после каждого урока." : "Без тестов."}
${params?.withSummary ? "Добавь краткий конспект в начало каждого урока." : ""}

Материалы (${sourceCount} источников):
${combinedText.slice(0, 12000)}

Верни ТОЛЬКО валидный JSON:
{
  "title": "Название курса",
  "description": "Описание курса (2-3 предложения)",
  "category": "onboarding",
  "difficulty": "beginner",
  "modules": [
    {
      "title": "Название модуля",
      "description": "Описание модуля",
      "lessons": [
        {
          "title": "Название урока",
          "content": "Содержание в Markdown",
          "duration_minutes": 15,
          "has_quiz": true,
          "quiz_questions": [
            {
              "question": "Вопрос",
              "options": ["А", "Б", "В", "Г"],
              "correct": 0
            }
          ]
        }
      ]
    }
  ]
}

Требования:
- Язык: русский
- category одно из: onboarding, product, sales, compliance, soft_skills
- difficulty одно из: beginner, intermediate, advanced
- Контент уроков должен быть основан на предоставленных материалах, не выдумывай факты`

    const response = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: "Ты — эксперт по созданию обучающих курсов для корпоративного обучения. Создай структурированный курс на основе предоставленных материалов. Ответь строго в JSON формате.",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Anthropic API error:", errorText)
      // Fallback to mock
      return NextResponse.json(getMockCourse(params, sourceCount))
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ""
    const parsed = parseAIResponse(content, params, sourceCount)
    return NextResponse.json(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка генерации курса"
    console.error("AI generate error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function parseAIResponse(content: string, params?: GenerateRequest["params"], sourceCount?: number): GeneratedCourse {
  try {
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)

    // Ensure modules structure exists
    if (!parsed.modules && parsed.lessons) {
      parsed.modules = [{ title: "Основной модуль", description: "", lessons: parsed.lessons }]
    }

    return parsed as GeneratedCourse
  } catch {
    console.error("Failed to parse AI response:", content.slice(0, 200))
    return getMockCourse(params, sourceCount)
  }
}
