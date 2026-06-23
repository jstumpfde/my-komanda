import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { buildComparison, type CompareResult } from "@/lib/compare/build-comparison"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-аналитик. Сравни кандидатов между собой по соответствию вакансии.

ПРАВИЛА:
- Сравнивай ТОЛЬКО на основе предоставленных данных
- Учитывай не только резюме (навыки/опыт), но и РЕЗУЛЬТАТЫ ТЕСТА (баллы и ответы)
  и ОТВЕТЫ В ДЕМОНСТРАЦИИ — они показывают реальные навыки, мотивацию и
  соответствие условиям. Если есть балл теста — он весомее, чем общий AI-скор резюме.
- fitScore: 0-100 для каждого кандидата
- pros/cons: 2-3 коротких пункта каждый
- recommendation: 1-2 предложения, кого выбрать и почему
- summary: краткое сравнение в 2-3 предложения

ФОРМАТ — только валидный JSON:
{
  "table": [
    { "candidateName": "Иванов", "pros": ["Опыт B2B 3 года"], "cons": ["Нет CRM"], "fitScore": 82 }
  ],
  "recommendation": "Рекомендуем Иванова — лучшее совпадение по опыту.",
  "summary": "Краткое сравнение."
}`

interface CompareInput {
  candidates: { id?: string; name: string; skills?: string[]; experience?: string; aiScore?: number; strengths?: string[]; weaknesses?: string[] }[]
  vacancyRequirements?: string
  vacancyId?: string
}

// Краткая выжимка теста/демо кандидата для промпта (баллы + ключевые ответы).
function enrichForPrompt(comp: CompareResult, id: string): string {
  const cand = comp.candidates.find((c) => c.id === id)
  const lines: string[] = []
  if (cand?.testScore != null) {
    lines.push(`Балл теста: ${cand.testScore}${cand.testPoints ? ` (${cand.testPoints.got}/${cand.testPoints.max})` : ""}`)
  }
  if (cand?.demoPercent != null) lines.push(`Демо пройдено: ${cand.demoPercent}%`)
  for (const section of comp.sections) {
    if (section.key === "anketa") continue // профиль уже отражён в резюме/опыте
    const qa: string[] = []
    for (const q of section.questions.slice(0, 6)) {
      const a = section.answers[id]?.[q.id]
      if (a?.value) {
        const v = a.value.replace(/\|\|\|/g, "; ").slice(0, 200)
        const mark = typeof a.awarded === "number" ? ` [${a.awarded}б${a.correct === false ? ", неверно" : a.correct ? ", верно" : ""}]` : ""
        qa.push(`• ${q.text}: ${v}${mark}`)
      }
    }
    if (qa.length) lines.push(`${section.title}:\n${qa.join("\n")}`)
  }
  return lines.join("\n")
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = (await req.json()) as CompareInput
    if (!body.candidates?.length) return apiError("Нужны кандидаты для сравнения", 400)

    // Подтягиваем тест/демо, если переданы id и вакансия (необязательно — при
    // отсутствии работает по-старому, только на резюме).
    let comp: CompareResult | null = null
    const ids = body.candidates.map((c) => c.id).filter((x): x is string => !!x)
    if (body.vacancyId && ids.length > 0) {
      try { comp = await buildComparison(body.vacancyId, ids) } catch { comp = null }
    }

    const candidateList = body.candidates.map((c, i) => {
      const base = `Кандидат ${i + 1}: ${c.name}\nНавыки: ${c.skills?.join(", ") || "—"}\nОпыт: ${c.experience || "—"}\nAI-скор резюме: ${c.aiScore ?? "—"}\nСильные: ${c.strengths?.join("; ") || "—"}\nСлабые: ${c.weaknesses?.join("; ") || "—"}`
      const extra = (comp && c.id) ? enrichForPrompt(comp, c.id) : ""
      return extra ? `${base}\n${extra}` : base
    }).join("\n\n")

    const userMessage = `Требования вакансии:\n${body.vacancyRequirements || "не указаны"}\n\n${candidateList}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess({
        table: body.candidates.map(c => ({ candidateName: c.name, pros: c.strengths || ["Данных мало"], cons: c.weaknesses || ["Данных мало"], fitScore: c.aiScore || 50 })),
        recommendation: `Рекомендуем ${body.candidates[0]?.name || "первого кандидата"}`,
        summary: "Недостаточно данных для подробного сравнения.",
      })
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT + AI_SAFETY_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return apiError("Не удалось разобрать ответ AI", 422)

    const parsed = JSON.parse(jsonMatch[0]) as { table: unknown[]; recommendation: string; summary: string }
    return apiSuccess(parsed)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("compare-candidates error:", err)
    return apiError("Internal server error", 500)
  }
}
