import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-эксперт. Тебе дают текст описания вакансии. Извлеки структурированные данные.

КРИТИЧЕСКИ ВАЖНО:
- Верни ТОЛЬКО валидный JSON, без markdown, без комментариев, без пояснений
- ТОЧНО разделяй секции: обязанности ≠ требования ≠ условия ≠ описание обучения
- Маркетинговый текст ИГНОРИРОВАТЬ — извлекать только факты

ЖЁСТКИЕ ПРАВИЛА ПО ПОЛЯМ:

bonus: ТОЛЬКО конкретные бонусы и KPI. Примеры: "KPI от выполнения плана", "13-я зарплата", "квартальные премии", "% от продаж". НЕ писать маркетинговые тексты, призывы, описания компании. Если нет конкретных бонусов — оставить ПУСТУЮ СТРОКУ "".

responsibilities: ТОЛЬКО рабочие обязанности и задачи. НЕ включать текст про обучение, адаптацию, культуру, команду. Формат: каждый пункт с новой строки через "• ", БЕЗ пустых строк между пунктами.
Пример: "• Холодные звонки и лидогенерация\n• Проведение переговоров и презентаций\n• Ведение CRM"

requirements: ТОЛЬКО требования к кандидату (опыт, навыки, знания). НЕ включать призывы, мотивацию, описания команды. Формат: каждый пункт с новой строки через "• ", БЕЗ пустых строк между пунктами.
Пример: "• Опыт в B2B продажах от 2 лет\n• Знание CRM-систем\n• Навыки переговоров"

Общие правила:
- Навыки — краткие фразы: "CRM", "B2B продажи", "Переговоры", "Excel"
- Зарплату — только числа, если диапазон "200 000 - 300 000 - 500 000" бери минимум и максимум
- screeningQuestions — 5 конкретных вопросов проверяющих ключевые компетенции для ЭТОЙ должности
- hhDescription — готовый HTML для публикации на hh.ru, структурированный с <h3>, <ul>, <li>, <p>

Формат JSON:
{
  "positionTitle": "название должности",
  "positionCategory": "Продажи|IT|HR|Финансы|Маркетинг|Логистика|Администрация|Производство",
  "industry": "отрасль (строительство, IT, ритейл...)",
  "positionCity": "город или Удалённо",
  "workFormats": ["Офис"],
  "employment": ["Полная"],
  "salaryFrom": "число",
  "salaryTo": "число",
  "bonus": "KPI + процент от продаж (ТОЛЬКО факты, без маркетинга)",
  "responsibilities": "• задача1\\n• задача2\\n• задача3",
  "requirements": "• требование1\\n• требование2\\n• требование3",
  "requiredSkills": ["навык1", "навык2"],
  "desiredSkills": ["навык1", "навык2"],
  "unacceptableSkills": ["что неприемлемо"],
  "conditions": ["условие1", "условие2"],
  "experienceMin": "число",
  "experienceIdeal": "число",
  "screeningQuestions": ["вопрос1", "вопрос2", "вопрос3", "вопрос4", "вопрос5"],
  "hhDescription": "<h3>О компании</h3><p>...</p><h3>Обязанности</h3><ul><li>...</li></ul>"
}`

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
