import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — опытный HR-интервьюер. Сгенерируй 10 вопросов для собеседования кандидата.

Структура:
- 3 поведенческих (STAR-метод): "Расскажите о ситуации когда..."
- 3 технических/профессиональных: по навыкам и требованиям вакансии
- 2 ситуационных: "Что вы будете делать если..."
- 2 персональных: по слабым сторонам кандидата из AI-скрининга

ПРАВИЛА:
- Вопросы конкретные, привязанные к данным кандидата и вакансии
- Каждый вопрос с полем purpose — что проверяем
- Тип: "behavioral" | "technical" | "situational" | "personal"

ФОРМАТ — только валидный JSON массив:
[
  { "question": "Расскажите о ситуации...", "type": "behavioral", "purpose": "Навыки переговоров" }
]`

interface QuestionsInput {
  candidateData: { name?: string; experience?: string; skills?: string[]; aiScore?: number; strengths?: string[]; weaknesses?: string[] }
  vacancyAnketa: { responsibilities?: string; requirements?: string; vacancyTitle?: string }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = (await req.json()) as QuestionsInput

    const userMessage = `Вакансия: ${body.vacancyAnketa?.vacancyTitle || "—"}
Обязанности: ${body.vacancyAnketa?.responsibilities || "—"}
Требования: ${body.vacancyAnketa?.requirements || "—"}

Кандидат: ${body.candidateData?.name || "—"}
Опыт: ${body.candidateData?.experience || "—"}
Навыки: ${body.candidateData?.skills?.join(", ") || "—"}
AI-скор: ${body.candidateData?.aiScore ?? "—"}
Сильные стороны: ${body.candidateData?.strengths?.join("; ") || "—"}
Слабые стороны: ${body.candidateData?.weaknesses?.join("; ") || "—"}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess([
        { question: "Расскажите о вашем опыте работы", type: "behavioral", purpose: "Общий опыт" },
        { question: "Какие задачи вы решали на прошлом месте?", type: "technical", purpose: "Компетенции" },
        { question: "Почему вас интересует эта позиция?", type: "situational", purpose: "Мотивация" },
      ])
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return apiError("Не удалось разобрать ответ AI", 422)

    const parsed = JSON.parse(jsonMatch[0])
    return apiSuccess(parsed)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("interview-questions error:", err)
    return apiError("Internal server error", 500)
  }
}
