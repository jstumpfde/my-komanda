import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-аналитик. Сравни кандидатов между собой по соответствию вакансии.

ПРАВИЛА:
- Сравнивай ТОЛЬКО на основе предоставленных данных
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
  candidates: { name: string; skills?: string[]; experience?: string; aiScore?: number; strengths?: string[]; weaknesses?: string[] }[]
  vacancyRequirements?: string
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = (await req.json()) as CompareInput
    if (!body.candidates?.length) return apiError("Нужны кандидаты для сравнения", 400)

    const candidateList = body.candidates.map((c, i) =>
      `Кандидат ${i + 1}: ${c.name}\nНавыки: ${c.skills?.join(", ") || "—"}\nОпыт: ${c.experience || "—"}\nAI-скор: ${c.aiScore ?? "—"}\nСильные: ${c.strengths?.join("; ") || "—"}\nСлабые: ${c.weaknesses?.join("; ") || "—"}`
    ).join("\n\n")

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
      model: "claude-sonnet-4-20250514",
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
