import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-менеджер. Сгенерируй текст оффера (предложения о работе) для кандидата.

ПРАВИЛА:
- Деловой, но дружелюбный тон
- Конкретные условия из предоставленных данных
- Не придумывай условий которых нет в данных
- Структура: приветствие, предложение, условия, дата начала, оформление, контакты

ФОРМАТ — только валидный JSON:
{
  "html": "<HTML-текст оффера с тегами h2, p, ul, li, strong>",
  "text": "Текстовая версия оффера"
}`

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = (await req.json()) as {
      candidateName?: string
      position?: string
      salary?: string
      startDate?: string
      conditions?: string
      companyName?: string
      companyInfo?: string
    }

    const userMessage = `Кандидат: ${body.candidateName || "—"}
Должность: ${body.position || "—"}
Компания: ${body.companyName || "—"}
О компании: ${body.companyInfo || "—"}
Зарплата: ${body.salary || "—"}
Дата начала: ${body.startDate || "по согласованию"}
Условия: ${body.conditions || "—"}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      const html = `<h2>Предложение о работе</h2>
<p>Уважаемый(ая) ${body.candidateName || "кандидат"},</p>
<p>Мы рады предложить вам позицию <strong>${body.position || "—"}</strong> в компании ${body.companyName || "—"}.</p>
<h3>Условия</h3>
<ul>
<li>Заработная плата: ${body.salary || "по договорённости"}</li>
<li>Дата начала: ${body.startDate || "по согласованию"}</li>
${body.conditions ? `<li>${body.conditions}</li>` : ""}
</ul>
<p>Ждём вашего ответа!</p>`
      return apiSuccess({ html, text: html.replace(/<[^>]+>/g, "\n").trim() })
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
