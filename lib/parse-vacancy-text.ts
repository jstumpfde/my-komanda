/**
 * Parse raw vacancy text (from DOCX/PDF/TXT) into structured anketa fields.
 * Only fills what's clearly present — never invents data.
 */

import { POSITION_CATEGORIES } from "@/lib/position-classifier"

// ─── Output type ────────────────────────────────────────────────────────────

export interface ParsedVacancy {
  // 2. Должность
  positionCategory: string
  workFormats: string[]      // "Офис" | "Гибрид" | "Удалёнка"
  employment: string[]       // "Полная" | "Частичная" | "Проектная"
  positionCity: string
  // 3. Мотивация
  salaryFrom: string
  salaryTo: string
  bonus: string
  // 4. Обязанности
  responsibilities: string
  requirements: string
  // 5. Портрет
  requiredSkills: string[]
  experienceMin: string
  // Stop factor toggles (id → value)
  stopFactors: Record<string, string | boolean>
  // Desired param toggles (ids to enable)
  desiredParams: string[]
  // 6. Условия
  conditions: string[]          // matched from standard list
  conditionsCustom: string[]    // free-form
  // Extra
  companyDescription: string
}

// ─── Section detection ──────────────────────────────────────────────────────

type SectionKey = "responsibilities" | "requirements" | "conditions" | "bonus" | "company" | "onboarding" | "unknown"

const SECTION_RULES: { key: SectionKey; re: RegExp }[] = [
  { key: "responsibilities", re: /^(?:обязанности|задачи|что\s+(?:нужно\s+)?(?:делать|будет)|функционал|чем\s+(?:предстоит|будете)\s+заниматься|ваши\s+задачи|основные\s+задачи|что\s+(?:будет\s+)?на\s+старте|(?:вам\s+)?предстоит)/i },
  { key: "requirements",     re: /^(?:требования|(?:кого\s+)?(?:мы\s+)?ищем|(?:что|кто)\s+(?:нам\s+)?нуж|ожидани|навыки|опыт|идеальный\s+кандидат|будет\s+(?:плюсом|преимуществом)|(?:наш|ваш)\s+(?:идеальный|будущий)|для\s+нас\s+важно|нам\s+важно)/i },
  { key: "conditions",       re: /^(?:условия|(?:мы\s+)?предлагаем|(?:мы\s+)?(?:предоставляем|гарантируем|обеспечиваем)|что\s+(?:мы\s+)?(?:предлагаем|даём|дадим)|бонусы|бенефиты|(?:наши\s+)?(?:преимущества|плюсы|плюшки)|компенсаци|льготы|почему\s+(?:мы|у\s+нас|стоит))/i },
  { key: "bonus",            re: /^(?:доход|зарплата|оплата|(?:финансовая|денежная)\s+мотивация|сколько\s+(?:платим|зарабатыв)|вознаграждени|мотивация)/i },
  { key: "company",          re: /^(?:о\s+компании|(?:наша\s+)?компания|кто\s+мы|о\s+нас|(?:ГК|группа\s+компаний|ООО|ИП|АО|ЗАО)\s)/i },
  { key: "onboarding",       re: /^(?:(?:что\s+будет\s+)?на\s+старте|адаптация|онбординг|ввод\s+в\s+должность|первые?\s+(?:недел|месяц|дн))/i },
]

function detectSection(line: string): SectionKey | null {
  const clean = line.replace(/^[\d#.\-–—:)\]•*]+\s*/, "").trim()
  if (!clean || clean.length > 100) return null
  for (const r of SECTION_RULES) {
    if (r.re.test(clean)) return r.key
  }
  return null
}

function isHeading(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 100) return false
  if (/^[•\-–—·]/.test(t)) return false
  return detectSection(t) !== null
}

// ─── Text formatting ────────────────────────────────────────────────────────

function formatBlock(lines: string[]): string {
  // Track whether we're inside a list (previous line was a bullet)
  let prevWasBullet = false

  const formatted = lines.map(line => {
    const t = line.trim()
    if (!t) { prevWasBullet = false; return "" }

    // Already a bullet/dash line → normalize
    if (/^[•\-–—·▪▸►✓✔☑⁃]\s*/.test(t)) {
      prevWasBullet = true
      return `• ${t.replace(/^[•\-–—·▪▸►✓✔☑⁃]\s*/, "")}`
    }

    // Numbered list item (1. / 1) / (1))
    if (/^\d+[.)]\s+/.test(t)) {
      prevWasBullet = true
      return `• ${t.replace(/^\d+[.)]\s+/, "")}`
    }

    // Short line following a colon-ending line → likely list item
    if (prevWasBullet && t.length < 120 && /^[а-яa-z]/.test(t)) {
      return `• ${t}`
    }

    prevWasBullet = false
    return t
  })

  return formatted
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ─── Extraction helpers ─────────────────────────────────────────────────────

function extractSalary(text: string): { from: string; to: string } {
  // "200 000 – 500 000"
  const m = text.match(/(\d[\d\s.]{2,})\s*[–—\-−]\s*(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (m) {
    return { from: m[1].replace(/[\s.]/g, ""), to: m[2].replace(/[\s.]/g, "") }
  }
  const mFrom = text.match(/от\s+(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (mFrom) return { from: mFrom[1].replace(/[\s.]/g, ""), to: "" }
  const mTo = text.match(/до\s+(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (mTo) return { from: "", to: mTo[1].replace(/[\s.]/g, "") }
  return { from: "", to: "" }
}

function extractCity(text: string): string {
  // Look for "г. Москва", "Город: Москва", "Локация: Санкт-Петербург"
  const cities = [
    "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань",
    "Нижний Новгород", "Челябинск", "Самара", "Омск", "Ростов-на-Дону",
    "Уфа", "Красноярск", "Воронеж", "Пермь", "Волгоград", "Краснодар",
    "Тюмень", "Саратов", "Тольятти", "Ижевск", "Барнаул", "Иркутск",
    "Хабаровск", "Ярославль", "Владивосток", "Махачкала", "Томск",
    "Оренбург", "Кемерово", "Рязань", "Астрахань", "Набережные Челны",
    "Пенза", "Липецк", "Тула", "Киров", "Калининград", "Сочи",
  ]
  for (const city of cities) {
    if (text.includes(city)) return city
  }
  // Try pattern "г. ..." or "город ..."
  const m = text.match(/(?:г\.\s*|город[:\s]+)([А-ЯЁ][а-яё]+(?:[- ][А-ЯЁа-яё]+)?)/i)
  if (m) return m[1]
  return ""
}

function extractWorkFormats(text: string): string[] {
  const formats: string[] = []
  const lower = text.toLowerCase()
  if (/(?:удал[её]нн|remote|дистанционн)/.test(lower)) formats.push("Удалёнка")
  if (/(?:гибрид|hybrid|смешанн)/.test(lower)) formats.push("Гибрид")
  if (/(?:офис[а-я]*\b|office|в\s+офис)/.test(lower) && !/(?:удал|remote)/.test(lower)) formats.push("Офис")
  return formats
}

function extractEmployment(text: string): string[] {
  const result: string[] = []
  const lower = text.toLowerCase()
  if (/(?:полн(?:ая|ый)\s+(?:занятость|рабочий)|full[- ]?time|полная\s+ставка)/.test(lower)) result.push("Полная")
  if (/(?:частичн(?:ая|ый)|part[- ]?time|неполн(?:ая|ый)\s+(?:занятость|день))/.test(lower)) result.push("Частичная")
  if (/(?:проектн(?:ая|ый)|фриланс|подряд)/.test(lower)) result.push("Проектная")
  return result
}

function extractExperience(text: string): string {
  // "от 3 лет", "опыт 2-5 лет", "3+ лет", "не менее 2 лет"
  const patterns = [
    /(?:опыт|стаж)\s+(?:от\s+)?(\d+)/i,
    /от\s+(\d+)\s*(?:лет|года)/i,
    /(?:не\s+менее|минимум)\s+(\d+)\s*(?:лет|года)/i,
    /(\d+)\+?\s*(?:лет|года)\s+(?:опыт|в\s+(?:продажах|сфере|отрасли))/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1]
  }
  return ""
}

function extractSkills(text: string): string[] {
  // Known skill patterns to look for
  const SKILL_DB = [
    "Холодные звонки", "Переговоры", "CRM", "B2B продажи", "B2C продажи",
    "Презентации", "Работа с возражениями", "Коммерческие предложения", "Тендеры",
    "1С", "Excel", "Word", "Документооборот", "Ведение базы клиентов",
    "Активные продажи", "Телефонные продажи", "Работа с дебиторкой",
    "Английский язык", "Управление командой", "Аналитика", "Маркетинг",
    "Финансовый анализ", "Публичные выступления", "Наставничество",
    "Стратегическое планирование", "Power BI", "SQL", "Python",
    "Водительские права", "Личный автомобиль", "Командировки",
    "Проектные продажи", "Работа с ЛПР", "Деловая переписка",
    "Подготовка договоров", "Знание рынка", "Сметы",
  ]
  const lower = text.toLowerCase()
  return SKILL_DB.filter(s => lower.includes(s.toLowerCase()))
}

function extractPositionCategory(title: string): string {
  const lower = title.toLowerCase()
  for (const [key, val] of Object.entries(POSITION_CATEGORIES)) {
    for (const kw of val.keywords) {
      if (lower.includes(kw.toLowerCase())) return key
    }
  }
  return ""
}

// Conditions matching
const CONDITIONS_OPTIONS = [
  "ДМС", "Фитнес", "Питание", "Обучение", "Парковка",
  "Мобильная связь", "Корпоративный транспорт", "Страхование жизни",
  "Оплата ГСМ", "13-я зарплата", "Гибкий график", "Удалённые дни",
  "Корпоративные мероприятия", "Программа релокации", "Stock options",
  "Материальная помощь", "Скидки на продукцию", "Компенсация обедов",
  "Оплачиваемые больничные сверх ТК", "Дополнительный отпуск",
  "Менторская программа", "Бюджет на конференции",
]

const CONDITIONS_ALIASES: Record<string, string[]> = {
  "ДМС": ["дмс", "медицинское страхование", "медицинская страховка"],
  "Фитнес": ["фитнес", "спортзал", "тренажерный зал"],
  "Питание": ["питание", "обеды", "бесплатные обеды"],
  "Обучение": ["обучение", "тренинги", "курсы повышения квалификации"],
  "Парковка": ["парковка"],
  "Гибкий график": ["гибкий график", "гибкое начало"],
  "Удалённые дни": ["удалённые дни", "удалённый день"],
  "Корпоративные мероприятия": ["корпоратив", "тимбилдинг"],
  "Дополнительный отпуск": ["дополнительный отпуск", "дополнительные дни отпуска"],
}

function matchConditions(text: string): { known: string[]; custom: string[] } {
  const lower = text.toLowerCase()
  const known: string[] = []
  const custom: string[] = []

  // Match standard conditions
  for (const opt of CONDITIONS_OPTIONS) {
    if (lower.includes(opt.toLowerCase())) {
      known.push(opt)
      continue
    }
    const aliases = CONDITIONS_ALIASES[opt]
    if (aliases?.some(a => lower.includes(a))) {
      known.push(opt)
    }
  }

  return { known, custom }
}

/**
 * Stop factors — only extract when text EXPLICITLY states a restriction.
 * Use requirements section only, not full text.
 */
function extractStopFactors(requirementsText: string): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {}

  // Age — only if explicit age range stated as requirement
  const ageMatch = requirementsText.match(/возраст\s+(?:от\s+)?(\d{2})\s*(?:до|[-–—])\s*(\d{2})/i)
  if (ageMatch) result.age = `${ageMatch[1]}-${ageMatch[2]}`

  // Citizenship — only if explicitly required
  if (/(?:гражданство\s+(?:рф|россии|российское)|только\s+граждане?\s+(?:рф|россии))/i.test(requirementsText)) {
    result.citizenship = "РФ"
  }

  // Documents — only "обязательно наличие прав" type phrases
  if (/(?:обязательно\s+(?:наличие\s+)?(?:водительск|прав)|(?:необходимы?|требуются?)\s+водительск|права\s+категории\s+[A-Eа-е])/i.test(requirementsText)) {
    result.documents = "Водительские права"
  }

  return result
}

/**
 * Desired params — only extract from requirements section,
 * and only when clearly stated as a requirement/preference.
 */
function extractDesiredParams(requirementsText: string): string[] {
  const params: string[] = []
  const lower = requirementsText.toLowerCase()

  // Only match specific requirement phrases, not casual mentions
  if (/(?:опыт\s+(?:работы\s+)?в\s+(?:отрасли|сфере|(?:данной|нашей|этой)\s+индустрии)|отраслевой\s+опыт\s+(?:обязателен|приветствуется|желателен))/i.test(lower)) params.push("industry_exp")
  if (/(?:(?:профильное|высшее|техническое)\s+образование\s+(?:обязательно|приветствуется|желательно)|(?:обязательно|необходимо)\s+(?:профильное|высшее)\s+образование)/i.test(lower)) params.push("education")
  if (/(?:(?:знание|опыт\s+работы\s+(?:с|в))\s+crm\s+(?:обязательно|приветствуется)?|(?:обязательно|необходимо)\s+(?:знание|владение)\s+crm)/i.test(lower)) params.push("crm")
  if (/(?:(?:знание\s+)?англий\S*\s+(?:язык\S*\s+)?(?:от\s+\w+|обязательно|приветствуется|не\s+ниже)|english\s+(?:required|preferred|b[12]|c[12]))/i.test(lower)) params.push("english")
  if (/(?:(?:опыт\s+)?управлени[яе]\s+(?:командой|коллективом|отделом)|руководства?\s+(?:командой|отделом|подразделением))/i.test(lower)) params.push("management")
  if (/(?:готовность\s+к\s+переезду|(?:возможен|рассматриваем)\s+переезд|релокац\S*\s+(?:обязательна|приветствуется|возможна))/i.test(lower)) params.push("relocation")
  if (/(?:готовность\s+к\s+командировкам|командировки\s+(?:обязательны|до\s+\d+%))/i.test(lower)) params.push("travel")

  return params
}

// ─── Main parser ────────────────────────────────────────────────────────────

export function parseVacancyText(rawText: string): ParsedVacancy {
  const lines = rawText.split("\n")

  // Split into sections
  const sections: { key: SectionKey; lines: string[] }[] = []
  let currentKey: SectionKey = "company"
  let currentLines: string[] = []

  for (const line of lines) {
    if (isHeading(line)) {
      if (currentLines.length > 0) {
        sections.push({ key: currentKey, lines: currentLines })
      }
      currentKey = detectSection(line) || currentKey
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentLines.length > 0) {
    sections.push({ key: currentKey, lines: currentLines })
  }

  // If no sections detected → all goes to responsibilities
  const hasReal = sections.some(s => s.key !== "company" && s.key !== "unknown")

  const result: ParsedVacancy = {
    positionCategory: "",
    workFormats: [],
    employment: [],
    positionCity: "",
    salaryFrom: "",
    salaryTo: "",
    bonus: "",
    responsibilities: "",
    requirements: "",
    requiredSkills: [],
    experienceMin: "",
    stopFactors: {},
    desiredParams: [],
    conditions: [],
    conditionsCustom: [],
    companyDescription: "",
  }

  if (!hasReal) {
    result.responsibilities = formatBlock(lines)
  } else {
    for (const section of sections) {
      const text = formatBlock(section.lines)
      if (!text) continue

      switch (section.key) {
        case "responsibilities":
        case "onboarding":
          result.responsibilities = result.responsibilities
            ? `${result.responsibilities}\n\n${text}`
            : text
          break
        case "requirements":
          result.requirements = result.requirements
            ? `${result.requirements}\n\n${text}`
            : text
          break
        case "conditions": {
          // Extract conditions items as lines
          const items = text.split("\n")
            .map(l => l.replace(/^•\s*/, "").trim())
            .filter(Boolean)
          const condText = items.join(" ")
          const matched = matchConditions(condText)
          result.conditions = [...new Set([...result.conditions, ...matched.known])]
          // Remaining items that didn't match → custom
          const knownLower = new Set(matched.known.map(k => k.toLowerCase()))
          const allAliases = new Set(
            Object.values(CONDITIONS_ALIASES).flat().map(a => a.toLowerCase())
          )
          const customItems = items.filter(item => {
            const il = item.toLowerCase()
            return !knownLower.has(il) && !allAliases.has(il) && ![...knownLower].some(k => il.includes(k))
          })
          result.conditionsCustom = [...new Set([...result.conditionsCustom, ...customItems])]
          break
        }
        case "bonus":
          result.bonus = text
          break
        case "company":
          result.companyDescription = result.companyDescription
            ? `${result.companyDescription}\n\n${text}`
            : text
          break
        default:
          // unknown sections go to responsibilities
          result.responsibilities = result.responsibilities
            ? `${result.responsibilities}\n\n${text}`
            : text
      }
    }
  }

  // ── Extract structured fields from full text ──
  const fullText = rawText

  // Salary
  const salary = extractSalary(fullText)
  result.salaryFrom = salary.from
  result.salaryTo = salary.to

  // City
  result.positionCity = extractCity(fullText)

  // Work format
  result.workFormats = extractWorkFormats(fullText)

  // Employment
  result.employment = extractEmployment(fullText)

  // Experience
  result.experienceMin = extractExperience(fullText)

  // Skills (from requirements section if available, otherwise full text)
  const skillSource = result.requirements || fullText
  result.requiredSkills = extractSkills(skillSource)

  // Position category (from title — will be set from vacancyTitle in the caller)
  // We still try from the full text
  const firstLine = lines.find(l => l.trim())?.trim() || ""
  result.positionCategory = extractPositionCategory(firstLine)

  // Stop factors & desired params — only from requirements section
  const reqText = result.requirements || ""
  result.stopFactors = extractStopFactors(reqText)
  result.desiredParams = extractDesiredParams(reqText)

  // Don't match conditions from full text — only from "Условия" section
  // to avoid false positives from casual mentions

  return result
}
