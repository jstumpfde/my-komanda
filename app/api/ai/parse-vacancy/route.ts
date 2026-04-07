import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — AI-ассистент для HR-платформы. Разбери текст описания вакансии и верни JSON.
Верни ТОЛЬКО валидный JSON без markdown, без комментариев:
{
  "positionTitle": "название должности",
  "positionCategory": "категория (Продажи/IT/HR/Финансы/Маркетинг/Логистика/Администрация/Производство)",
  "industry": "отрасль компании",
  "workFormats": ["Офис" и/или "Гибрид" и/или "Удалёнка"],
  "employment": ["Полная" и/или "Частичная" и/или "Проектная"],
  "positionCity": "город",
  "salaryFrom": "число",
  "salaryTo": "число",
  "bonus": "описание бонусов",
  "requiredSkills": ["навык1", "навык2"],
  "desiredSkills": ["навык1", "навык2"],
  "unacceptableSkills": ["что неприемлемо"],
  "responsibilities": "текст обязанностей",
  "requirements": "текст требований",
  "conditions": ["условие1", "условие2"],
  "experienceMin": "число лет",
  "experienceIdeal": "число лет",
  "screeningQuestions": ["вопрос1 для кандидата", "вопрос2", "вопрос3", "вопрос4", "вопрос5"],
  "hhDescription": "готовый текст описания вакансии для hh.ru в формате HTML"
}

Правила:
- Если информации недостаточно — заполни что можешь, остальные поля оставь пустыми строками или пустыми массивами.
- Навыки бери реалистичные для данной должности: "CRM", "B2B продажи", "Холодные звонки", "Excel", "1С".
- Зарплату указывай только числами без пробелов.
- workFormats и employment — только из указанных вариантов.
- Вопросы для скрининга — конкретные, проверяющие ключевые компетенции (5 штук).
- Описание для hh.ru — профессиональное, структурированное, с HTML-тегами (<p>, <ul>, <li>, <b>).
- НЕ придумывай факты которых нет в тексте, но ДОПОЛНИ навыки и условия типичными для данной должности.
- Ответ должен быть ТОЛЬКО JSON.`

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = await req.json() as { text?: string }
    if (!body.text?.trim()) {
      return apiError("Текст обязателен", 400)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess(fallbackParse(body.text.trim()))
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: body.text.trim() }],
    })

    const content = response.content[0]
    if (content.type !== "text") {
      return apiError("Неожиданный ответ AI", 500)
    }

    let parsed: Record<string, unknown>
    try {
      const raw = content.text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
      parsed = JSON.parse(raw)
    } catch {
      // Try to extract JSON from response with regex
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          return apiError("Не удалось разобрать текст", 422)
        }
      } else {
        return apiError("Не удалось разобрать текст", 422)
      }
    }

    const result = normalize(parsed)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("parse-vacancy error:", err)
    return apiError("Internal server error", 500)
  }
}

function normalize(parsed: Record<string, unknown>) {
  return {
    positionTitle: String(parsed.positionTitle || parsed.vacancyTitle || ""),
    positionCategory: String(parsed.positionCategory || ""),
    industry: String(parsed.industry || ""),
    positionCity: String(parsed.positionCity || ""),
    workFormats: toStringArray(parsed.workFormats),
    employment: toStringArray(parsed.employment),
    salaryFrom: String(parsed.salaryFrom || ""),
    salaryTo: String(parsed.salaryTo || ""),
    bonus: String(parsed.bonus || ""),
    responsibilities: String(parsed.responsibilities || ""),
    requirements: String(parsed.requirements || ""),
    requiredSkills: toStringArray(parsed.requiredSkills),
    desiredSkills: toStringArray(parsed.desiredSkills),
    unacceptableSkills: toStringArray(parsed.unacceptableSkills),
    experienceMin: String(parsed.experienceMin || ""),
    experienceIdeal: String(parsed.experienceIdeal || ""),
    conditions: toStringArray(parsed.conditions),
    screeningQuestions: toStringArray(parsed.screeningQuestions),
    hhDescription: String(parsed.hhDescription || ""),
  }
}

function toStringArray(val: unknown): string[] {
  return Array.isArray(val) ? val.map(String) : []
}

// ─── Fallback parser when no API key ───────────────────────────────────────

function fallbackParse(text: string) {
  const lower = text.toLowerCase()

  const firstLine = text.split(/[.\n]/)[0]?.trim() || ""
  const vacancyTitle = firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine

  const cityMatch = text.match(/(?:Москва|Санкт-Петербург|Екатеринбург|Казань|Новосибирск|Удалённо|удалёнка)/i)
  const positionCity = cityMatch?.[0] || ""

  const salaryMatch = text.match(/(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)/)
  let salaryFrom = ""
  let salaryTo = ""
  if (salaryMatch) {
    salaryFrom = salaryMatch[1].replace(/\s/g, "").replace(/к$/i, "000")
    salaryTo = salaryMatch[2].replace(/\s/g, "").replace(/к$/i, "000")
  }

  const skillKeywords = [
    "CRM", "B2B", "B2C", "Excel", "1С", "холодные звонки", "переговоры",
    "презентации", "тендеры", "продажи", "маркетинг", "SEO", "SMM",
    "Python", "JavaScript", "React", "SQL", "Git", "Docker",
    "управление командой", "аналитика", "английский",
  ]
  const requiredSkills = skillKeywords.filter(s => lower.includes(s.toLowerCase()))

  const workFormats: string[] = []
  if (lower.includes("удалён") || lower.includes("remote")) workFormats.push("Удалёнка")
  if (lower.includes("гибрид") || lower.includes("hybrid")) workFormats.push("Гибрид")
  if (workFormats.length === 0) workFormats.push("Офис")

  const expMatch = text.match(/опыт\s*(?:от\s*)?(\d+)/i)

  return {
    positionTitle: vacancyTitle,
    positionCategory: "",
    industry: "",
    positionCity,
    workFormats,
    employment: ["Полная"],
    salaryFrom, salaryTo,
    bonus: "",
    responsibilities: "", requirements: "",
    requiredSkills, desiredSkills: [], unacceptableSkills: [],
    experienceMin: expMatch?.[1] || "", experienceIdeal: "",
    conditions: [],
    screeningQuestions: [],
    hhDescription: "",
  }
}
