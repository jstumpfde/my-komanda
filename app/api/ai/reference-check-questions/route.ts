import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-специалист. Сгенерируй скрипт для проверки рекомендаций кандидата по телефону.

Структура:
- intro: вступительная фраза для звонка (1-2 предложения)
- questions: 8-10 вопросов для предыдущего работодателя (подтверждение работы, обязанности, результаты, сильные стороны, зоны роста, причина ухода, рекомендация)
- redFlags: 3-5 пунктов на что обратить внимание в ответах

ФОРМАТ — только валидный JSON:
{
  "intro": "Здравствуйте, я звоню по рекомендации...",
  "questions": ["Подтвердите, пожалуйста, что..."],
  "redFlags": ["Уклончивые ответы о причине увольнения"]
}`

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = (await req.json()) as { candidateName?: string; position?: string; responsibilities?: string; candidateExperience?: string }

    const userMessage = `Кандидат: ${body.candidateName || "—"}
Позиция: ${body.position || "—"}
Обязанности: ${body.responsibilities || "—"}
Опыт кандидата: ${body.candidateExperience || "—"}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess({
        intro: `Здравствуйте, я звоню по рекомендации ${body.candidateName || "кандидата"}, который претендует на позицию ${body.position || "в нашей компании"}.`,
        questions: [
          "Подтвердите, пожалуйста, что кандидат работал в вашей компании.",
          "Какие обязанности выполнял?",
          "Как вы оцениваете результаты работы?",
          "Какие сильные стороны можете выделить?",
          "Какие зоны для развития?",
          "Какова причина ухода?",
          "Рекомендовали бы вы этого сотрудника?",
        ],
        redFlags: ["Уклончивые ответы", "Несовпадение дат работы", "Негативная оценка командной работы"],
      })
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return apiError("Не удалось разобрать ответ AI", 422)
    return apiSuccess(JSON.parse(jsonMatch[0]))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
