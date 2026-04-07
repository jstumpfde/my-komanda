import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — HR-аналитик. Тебе дают текст описания вакансии. Извлеки ТОЛЬКО фактическую информацию.

═══ ОБЩИЕ ПРАВИЛА ═══
- Верни ТОЛЬКО валидный JSON, без markdown, без комментариев.
- Извлекай ТОЛЬКО факты из текста. Маркетинг, призывы, описания компании, мотивационные фразы ("мы ценим", "если вы готовы", "до встречи в команде") — ИГНОРИРОВАТЬ полностью.
- Формат текстовых полей (bonus, responsibilities, requirements): "• пункт\\n• пункт" — буллеты, одинарный перенос. НЕ двойной (\\n\\n запрещён). БЕЗ пустых строк между пунктами.
- Максимум 5-7 пунктов на поле. Только самые важные. Не дублировать между полями.
- Если информации для поля нет в тексте — вернуть пустую строку "" (для строк) или [] (для массивов).
- НИКОГДА не выдумывать информацию которой нет в исходном тексте.
- НЕ дублировать информацию между полями. Каждый факт — ровно в одном поле.

═══ ПРАВИЛА ПО ПОЛЯМ ═══

bonus (Бонусы/KPI):
ВКЛЮЧАТЬ: система оплаты (оклад + KPI + %), конкретные суммы бонусов, 13-я зарплата, квартальные премии, бонусы за перевыполнение, скидки сотрудникам, процент от продаж.
НЕ ВКЛЮЧАТЬ: "белая зарплата", "оформление по ТК", график работы, отпуск, карьерный рост, обучение, описание коллектива, ДМС, питание.
Если нет конкретных бонусов/KPI — вернуть "".
Пример: "• Оклад + KPI от выполнения плана\\n• Бонусы за перевыполнение\\n• Скидки на продукцию компании"

responsibilities (Обязанности):
ВКЛЮЧАТЬ: конкретные рабочие задачи, которые сотрудник будет выполнять.
НЕ ВКЛЮЧАТЬ: описание компании, процесс собеседования, обучение, адаптацию, "зачем этот формат", "мы ценим время", что получит кандидат.
Пример: "• Ведение переговоров с клиентами\\n• Контроль получения оплаты\\n• Выстраивание отношений с клиентами\\n• Ведение отчётности в CRM"

requirements (Требования к кандидату):
ВКЛЮЧАТЬ: опыт работы, навыки, знания, образование, личные качества для работы.
НЕ ВКЛЮЧАТЬ: призывы ("если вы готовы..."), что получит кандидат, мотивационные фразы, "откликайтесь".
Пример: "• Опыт в B2B продажах от 1 года\\n• Уверенный пользователь ПК (Google Docs, CRM)\\n• Навыки переговоров"

conditions (Условия — массив строк):
Извлечь условия ТОЛЬКО из этого списка: "ДМС", "Фитнес", "Питание", "Обучение", "Парковка", "Мобильная связь", "Корпоративный транспорт", "Страхование жизни", "Оплата ГСМ", "13-я зарплата", "Гибкий график", "Удалённые дни", "Корпоративные мероприятия", "Программа релокации", "Stock options", "Материальная помощь", "Скидки на продукцию", "Компенсация обедов", "Оплачиваемые больничные сверх ТК", "Дополнительный отпуск", "Менторская программа", "Бюджет на конференции".
Возвращать ТОЛЬКО строки из этого списка. Не выдумывать свои.

requiredSkills (Обязательные навыки — массив):
3-7 ключевых профессиональных навыков. Короткие фразы 1-3 слова.
Пример: ["B2B продажи", "Переговоры", "CRM", "Проектные продажи"]

desiredSkills (Желательные навыки — массив):
Навыки которые указаны как "желательно", "будет плюсом", "преимущество".

═══ ФОРМАТ JSON ═══
{
  "positionTitle": "название должности (кратко, без компании)",
  "positionCategory": "Продажи|IT|HR|Финансы|Маркетинг|Логистика|Администрация|Производство",
  "industry": "отрасль",
  "positionCity": "город или Удалённо",
  "workFormats": ["Офис"|"Гибрид"|"Удалёнка"],
  "employment": ["Полная"|"Частичная"|"Проектная"],
  "salaryFrom": "число (только цифры, без пробелов)",
  "salaryTo": "число (только цифры, без пробелов)",
  "bonus": "• пункт1\\n• пункт2 (или пустая строка)",
  "responsibilities": "• задача1\\n• задача2\\n• задача3",
  "requirements": "• требование1\\n• требование2\\n• требование3",
  "requiredSkills": ["навык1", "навык2"],
  "desiredSkills": ["навык1", "навык2"],
  "unacceptableSkills": [],
  "conditions": ["ДМС", "Обучение"],
  "experienceMin": "число лет или пусто",
  "experienceIdeal": "число лет или пусто",
  "screeningQuestions": ["5 вопросов проверяющих ключевые компетенции для ЭТОЙ должности"],
  "hhDescription": "<h3>О компании</h3><p>...</p><h3>Обязанности</h3><ul><li>...</li></ul><h3>Требования</h3><ul><li>...</li></ul><h3>Условия</h3><ul><li>...</li></ul>"
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
