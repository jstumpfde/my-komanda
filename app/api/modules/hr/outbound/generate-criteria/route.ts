// POST /api/modules/hr/outbound/generate-criteria
//
// Принимает текстовое описание идеального кандидата → Claude извлекает
// структурированные критерии поиска (OutboundCriteria) + мягкие пожелания
// для AI-скоринга. HR не думает про hh-параметры — пишет словами.
//
// Пример: "Продавал промышленное оборудование B2B, опыт 3+ лет,
//          желательно работал в Siemens или Bosch, Москва"
// →  text: "промышленное оборудование продажи B2B",
//    experience: "between3And6", area: "Москва",
//    softCriteria: "Желательно опыт в Siemens, Bosch; опыт в крупных проектных продажах"

import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { AI_MODEL_FAST } from "@/lib/ai/models"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: process.env.CLAUDE_PROXY_URL ?? undefined,
})

interface GenerateCriteriaBody {
  description: string
  vacancyTitle?: string
  vacancyCity?: string
}

const SYSTEM = `Ты — помощник по подбору персонала. Пользователь описывает идеального кандидата словами.
Твоя задача — извлечь структурированные критерии для поиска на hh.ru (жёсткие фильтры + целевые текстовые клаузы) и мягкие пожелания для AI-скоринга.

hh.ru позволяет искать по конкретным полям резюме через параметр search_field:
- TITLE — должность/заголовок резюме
- SKILLS — раздел навыков
- EXPERIENCE — описание опыта работы (где работал, чем занимался, отрасль)
- COMPANY_NAME — название компании где работал
- EVERYWHERE — везде (по умолчанию)

Верни ТОЛЬКО валидный JSON без markdown-обёрток. Формат:
{
  "textClauses": [
    {"text": "...", "field": "TITLE|SKILLS|EXPERIENCE|COMPANY_NAME|EVERYWHERE"},
    ...
  ],
  "experience": "noExperience|between1And3|between3And6|moreThan6|null",
  "salaryFrom": число или null,
  "salaryTo": число или null,
  "area": "название города на русском или null",
  "softCriteria": "мягкие пожелания для AI-скоринга — всё что не вошло в жёсткие фильтры. Строка до 500 символов или null"
}

Правила формирования textClauses:
- Разбей описание на смысловые части: должность → TITLE, навыки/технологии → SKILLS, отрасль/тип задач → EXPERIENCE, конкретные компании → COMPANY_NAME
- 1-3 клауза, каждый — короткая фраза 2-5 слов
- Если всё укладывается в один TITLE или EVERYWHERE — используй один клауз
- НЕ дублируй одно и то же слово в нескольких клаузах
- Пример: "продавал промышленное оборудование в авиации" →
  [{"text":"менеджер продаж оборудование","field":"TITLE"}, {"text":"авиация авиаперевозки","field":"EXPERIENCE"}]

Правила остальных полей:
- experience: выбери ближайшее значение; если не указан — null
- salary: только если явно указана сумма; игнорируй "хорошая зп"
- area: только если явно упомянут город/регион; иначе null
- softCriteria: опыт в конкретных компаниях, брендах, технологиях, личные качества — всё что не вошло в textClauses`

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  void user

  let body: GenerateCriteriaBody
  try {
    body = (await req.json()) as GenerateCriteriaBody
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }

  const description = body.description?.trim()
  if (!description || description.length < 5) {
    return apiError("Описание слишком короткое", 400)
  }
  if (description.length > 2000) {
    return apiError("Описание слишком длинное (макс. 2000 символов)", 400)
  }

  const userMsg = [
    body.vacancyTitle ? `Вакансия: ${body.vacancyTitle}` : null,
    body.vacancyCity ? `Город вакансии: ${body.vacancyCity}` : null,
    `Описание кандидата: ${description}`,
  ].filter(Boolean).join("\n")

  try {
    const msg = await client.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    })

    const raw = (msg.content[0] as { type: string; text?: string }).text ?? ""
    // Убираем markdown-блоки если модель всё же обернула
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

    let parsed: {
      textClauses?: Array<{ text?: unknown; field?: unknown }>
      text?: string
      experience?: string
      salaryFrom?: number | null
      salaryTo?: number | null
      area?: string | null
      softCriteria?: string | null
    }
    try {
      parsed = JSON.parse(clean)
    } catch {
      return apiError("AI вернул некорректный JSON. Попробуйте переформулировать описание.", 502)
    }

    // Валидация experience
    const VALID_EXP = new Set(["noExperience", "between1And3", "between3And6", "moreThan6"])
    const experience = parsed.experience && VALID_EXP.has(parsed.experience) ? parsed.experience : null

    // Валидация textClauses — только допустимые поля hh.
    const VALID_FIELD = new Set(["EVERYWHERE", "TITLE", "COMPANY_NAME", "SKILLS", "EXPERIENCE"])
    const textClauses = Array.isArray(parsed.textClauses)
      ? parsed.textClauses
          .filter((c) => typeof c?.text === "string" && c.text.trim().length > 0)
          .map((c) => ({
            text: String(c.text).trim().slice(0, 200),
            field: VALID_FIELD.has(String(c.field ?? "")) ? String(c.field) : "EVERYWHERE",
          }))
          .slice(0, 5)
      : []

    return NextResponse.json({
      ok: true,
      textClauses,
      criteria: {
        // text для обратной совместимости — первый клауз или legacy поле.
        text: textClauses[0]?.text ?? (typeof parsed.text === "string" ? parsed.text.trim().slice(0, 200) : ""),
        experience: experience ?? "any",
        salaryFrom: typeof parsed.salaryFrom === "number" && parsed.salaryFrom > 0 ? parsed.salaryFrom : null,
        salaryTo: typeof parsed.salaryTo === "number" && parsed.salaryTo > 0 ? parsed.salaryTo : null,
        area: typeof parsed.area === "string" ? parsed.area.trim() : "",
      },
      softCriteria: typeof parsed.softCriteria === "string" ? parsed.softCriteria.slice(0, 500) : "",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[outbound/generate-criteria]", msg)
    return apiError(`AI недоступен: ${msg.slice(0, 200)}`, 502)
  }
}
