import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — опытный рекрутер и копирайтер. Генерируй описание вакансии для публикации на hh.ru.

═══ ПРАВИЛА ═══
- Текст профессиональный, вовлекающий, без перегибов.
- НЕ используй: "лучшая компания", "уникальная возможность", "сверхдоход", "нереальные заработки", "мечта любого", "прорывной", "инновационный лидер". Без clickbait и пустых обещаний.
- Опирайся ТОЛЬКО на факты из входных данных. Не придумывай то, чего нет.
- Если данных мало — пиши кратко. Лучше короткое точное описание, чем длинное придуманное.
- Пиши от третьего лица ("Компания ищет...", "Мы предлагаем...").
- Маркированные списки — используй "—" как маркер (не *, не •).
- Каждый пункт — 1 строка, конкретная формулировка.

═══ СТРУКТУРА HTML ═══

<h3>О компании</h3>
<p>2-3 предложения. Отрасль, чем занимается, масштаб (если известно). Без лести.</p>

<h3>Обязанности</h3>
<ul>
<li>5-7 конкретных задач из входных данных</li>
</ul>

<h3>Требования</h3>
<ul>
<li>4-6 требований: опыт, навыки, знания</li>
</ul>

<h3>Условия</h3>
<ul>
<li>5-8 пунктов: зарплата (если указана), график, формат, бонусы, соцпакет</li>
</ul>

Если есть конкретные бонусы/KPI — добавь блок:
<h3>Мы предлагаем</h3>
<ul><li>...</li></ul>

═══ ФОРМАТ ОТВЕТА ═══
Верни ТОЛЬКО HTML-код описания. Без markdown, без обёрток, без пояснений.
Используй только теги: h3, p, ul, li, strong. Без div, span, br.`

interface AnketaInput {
  vacancyTitle?: string
  companyName?: string
  industry?: string
  positionCity?: string
  workFormats?: string[]
  employment?: string[]
  salaryFrom?: string
  salaryTo?: string
  bonus?: string
  responsibilities?: string
  requirements?: string
  requiredSkills?: string[]
  desiredSkills?: string[]
  conditions?: string[]
  conditionsCustom?: string[]
  experienceMin?: string
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = (await req.json()) as { anketa?: AnketaInput }
    const a = body.anketa
    if (!a) return apiError("Данные анкеты обязательны", 400)

    // Build context text from anketa
    const lines: string[] = []
    if (a.vacancyTitle) lines.push(`Должность: ${a.vacancyTitle}`)
    if (a.companyName) lines.push(`Компания: ${a.companyName}`)
    if (a.industry) lines.push(`Отрасль: ${a.industry}`)
    if (a.positionCity) lines.push(`Город: ${a.positionCity}`)
    if (a.workFormats?.length) lines.push(`Формат: ${a.workFormats.join(", ")}`)
    if (a.employment?.length) lines.push(`Занятость: ${a.employment.join(", ")}`)
    if (a.salaryFrom || a.salaryTo) {
      const parts = []
      if (a.salaryFrom) parts.push(`от ${a.salaryFrom}`)
      if (a.salaryTo) parts.push(`до ${a.salaryTo}`)
      lines.push(`Зарплата: ${parts.join(" ")} ₽`)
    }
    if (a.bonus) lines.push(`Бонусы/KPI: ${a.bonus}`)
    if (a.experienceMin) lines.push(`Опыт: от ${a.experienceMin} лет`)
    if (a.responsibilities) lines.push(`\nОбязанности:\n${a.responsibilities}`)
    if (a.requirements) lines.push(`\nТребования:\n${a.requirements}`)
    if (a.requiredSkills?.length) lines.push(`Обязательные навыки: ${a.requiredSkills.join(", ")}`)
    if (a.desiredSkills?.length) lines.push(`Желательные навыки: ${a.desiredSkills.join(", ")}`)
    const allConditions = [...(a.conditions || []), ...(a.conditionsCustom || [])]
    if (allConditions.length) lines.push(`Условия: ${allConditions.join(", ")}`)

    const userText = lines.join("\n")
    if (userText.trim().length < 20) {
      return apiError("Заполните анкету подробнее для генерации описания", 400)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess({ html: fallbackHtml(a), text: "" })
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: SYSTEM_PROMPT + AI_SAFETY_PROMPT,
      messages: [{ role: "user", content: userText }],
    })

    const content = response.content[0]
    if (content.type !== "text") {
      return apiError("Неожиданный ответ AI", 500)
    }

    const html = content.text
      .replace(/^```html?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim()

    // Strip tags for plain text version
    const text = html
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    return apiSuccess({ html, text })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("generate-hh-description error:", err)
    return apiError("Internal server error", 500)
  }
}

function fallbackHtml(a: AnketaInput): string {
  const sections: string[] = []

  sections.push("<h3>О компании</h3>")
  if (a.companyName || a.industry) {
    sections.push(`<p>${[a.companyName, a.industry].filter(Boolean).join(" — ")}.</p>`)
  } else {
    sections.push("<p>Компания ищет специалиста на позицию.</p>")
  }

  if (a.responsibilities) {
    sections.push("<h3>Обязанности</h3><ul>")
    a.responsibilities.split("\n").filter(l => l.trim()).forEach(l => {
      sections.push(`<li>${l.replace(/^[•\-–—]\s*/, "").trim()}</li>`)
    })
    sections.push("</ul>")
  }

  if (a.requirements) {
    sections.push("<h3>Требования</h3><ul>")
    a.requirements.split("\n").filter(l => l.trim()).forEach(l => {
      sections.push(`<li>${l.replace(/^[•\-–—]\s*/, "").trim()}</li>`)
    })
    sections.push("</ul>")
  }

  const conds = [...(a.conditions || []), ...(a.conditionsCustom || [])]
  if (conds.length > 0) {
    sections.push("<h3>Условия</h3><ul>")
    conds.forEach(c => sections.push(`<li>${c}</li>`))
    sections.push("</ul>")
  }

  return sections.join("\n")
}
