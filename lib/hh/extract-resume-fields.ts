// Извлечение «расширенных» полей кандидата из raw hh-resume (полное резюме
// /resumes/{id} либо preview из /negotiations). Импортёр кладёт это в hh_responses.raw_data,
// а затем при создании/апдейте кандидата мы превращаем raw в значения колонок
// `candidates`. Если какого-то поля нет — возвращаем undefined, чтобы вызывающий
// код мог не перезаписывать существующие значения (см. process-queue.ts).

export interface ExtractedHhFields {
  // Базовые
  city?:               string | null
  salaryMin?:          number | null
  salaryMax?:          number | null
  // HR-020 фильтры
  birthDate?:          string | null   // YYYY-MM-DD (date column)
  experienceYears?:    number | null
  educationLevel?:     "secondary" | "specialized" | "higher" | "mba" | null
  workFormat?:         "office" | "hybrid" | "remote" | null
  keySkills?:          string[]
  skills?:             string[]
  languages?:          string[]
  relocationReady?:    boolean | null
  businessTripsReady?: boolean | null
  // legacy
  experience?:         string | null   // напр. "5 лет"
}

// Сырое резюме hh — как приходит из API (см. lib/hh-api.ts:HHFullResume)
type RawResume = {
  birth_date?: unknown
  age?: unknown
  area?: { name?: unknown } | null
  salary?: { amount?: unknown; currency?: unknown } | null
  total_experience?: { months?: unknown } | null
  experience?: Array<{ total_months?: unknown }> | unknown
  skill_set?: unknown
  skills?: unknown
  education?: {
    level?: { id?: unknown; name?: unknown } | null
    primary?: unknown
    additional?: unknown
  } | null
  language?: Array<{ name?: unknown; level?: { name?: unknown } | null }> | unknown
  relocation?: { type?: { id?: unknown } | null } | null
  business_trip_readiness?: { id?: unknown; name?: unknown } | null
  schedule?: { id?: unknown; name?: unknown } | null
  schedules?: Array<{ id?: unknown }> | unknown
  employments?: Array<{ id?: unknown }> | unknown
  business_trip?: unknown
  [key: string]: unknown
}

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

// hh.education.level.id  →  наша education_level
// Карта подсмотрена по https://api.hh.ru/dictionaries#education_level
function mapEducationLevel(id?: unknown): ExtractedHhFields["educationLevel"] {
  if (!isString(id)) return null
  switch (id) {
    case "secondary":           return "secondary"
    case "special_secondary":   return "specialized"
    case "unfinished_higher":
    case "higher":
    case "bachelor":
    case "master":
    case "candidate":
    case "doctor":              return "higher"
    case "mba":                 return "mba"
    default:                    return null
  }
}

// hh.schedule.id → наш work_format. Поддерживаем несколько источников
// (resume.schedule, resume.schedules[]).
function mapWorkFormat(raw: RawResume): ExtractedHhFields["workFormat"] {
  const ids: string[] = []
  if (raw.schedule && typeof raw.schedule === "object") {
    const id = (raw.schedule as { id?: unknown }).id
    if (isString(id)) ids.push(id)
  }
  if (Array.isArray(raw.schedules)) {
    for (const s of raw.schedules as Array<{ id?: unknown }>) {
      if (isString(s?.id)) ids.push(s.id)
    }
  }
  if (ids.includes("remote")) return "remote"
  if (ids.includes("flexible") || ids.includes("flexibility")) return "hybrid"
  if (ids.includes("fullDay") || ids.includes("shift")) return "office"
  return null
}

// resume.relocation: hh выдаёт варианты — type.id ∈ {no_relocation, relocation_possible, relocation_desirable}
function mapRelocation(raw: RawResume): boolean | null {
  const rel = raw.relocation as { type?: { id?: unknown } | null } | undefined
  const id = rel?.type?.id
  if (!isString(id)) return null
  if (id === "no_relocation") return false
  if (id === "relocation_possible" || id === "relocation_desirable") return true
  return null
}

// resume.business_trip_readiness.id ∈ {ready, never, sometimes}
function mapBusinessTrips(raw: RawResume): boolean | null {
  const id = raw.business_trip_readiness?.id
  if (!isString(id)) return null
  if (id === "ready" || id === "sometimes") return true
  if (id === "never") return false
  return null
}

function parseLanguages(raw: RawResume): string[] {
  if (!Array.isArray(raw.language)) return []
  return (raw.language as Array<{ name?: unknown; level?: { name?: unknown } | null }>)
    .map(l => {
      if (!isString(l?.name)) return null
      const lvl = isString(l.level?.name) ? ` (${l.level!.name})` : ""
      return `${l.name}${lvl}`
    })
    .filter((s): s is string => s !== null)
}

function parseExperienceYears(raw: RawResume): number | null {
  // Приоритет: total_experience.months → divide by 12
  const totalMonths = raw.total_experience?.months
  if (isNumber(totalMonths)) return Math.round(totalMonths / 12)
  // Запасной путь: суммируем experience[].total_months (некоторые resume preview без total_experience)
  if (Array.isArray(raw.experience)) {
    let sum = 0
    let any = false
    for (const e of raw.experience as Array<{ total_months?: unknown }>) {
      if (isNumber(e?.total_months)) { sum += e.total_months; any = true }
    }
    if (any) return Math.round(sum / 12)
  }
  return null
}

// resume.age (число лет) → birth_date = YYYY-01-01, где YYYY = текущий_год − age
function deriveBirthDateFromAge(age: unknown): string | null {
  if (!isNumber(age) || age < 14 || age > 100) return null
  const year = new Date().getUTCFullYear() - Math.floor(age)
  return `${year}-01-01`
}

function parseBirthDate(raw: RawResume): string | null {
  // Приоритет — birth_date (точное значение). Иначе вычисляем по age.
  const bd = raw.birth_date
  if (isString(bd) && /^\d{4}-\d{2}-\d{2}/.test(bd)) {
    return bd.slice(0, 10)
  }
  return deriveBirthDateFromAge(raw.age)
}

// Главный парсер. raw — это либо resp.rawData.resume, либо resp.rawData (если рез-резюме
// уже разложено на верхнем уровне).
export function extractHhResumeFields(raw: unknown): ExtractedHhFields {
  if (!raw || typeof raw !== "object") return {}
  const r = raw as RawResume

  const out: ExtractedHhFields = {}

  // city
  const cityName = r.area?.name
  if (isString(cityName)) out.city = cityName

  // salary
  const salaryAmount = r.salary?.amount
  if (isNumber(salaryAmount)) {
    out.salaryMin = salaryAmount
    out.salaryMax = salaryAmount
  }

  // birth date
  out.birthDate = parseBirthDate(r)

  // experience
  out.experienceYears = parseExperienceYears(r)
  if (out.experienceYears !== null) {
    out.experience = `${out.experienceYears} лет`
  }

  // education
  out.educationLevel = mapEducationLevel(r.education?.level?.id)

  // skills
  if (Array.isArray(r.skill_set)) {
    const arr = (r.skill_set as unknown[]).filter(isString)
    out.keySkills = arr
    // Дублируем в legacy `skills` для обратной совместимости
    out.skills = arr
  }

  // languages
  const langs = parseLanguages(r)
  if (langs.length > 0) out.languages = langs

  // work format / relocation / business trips
  out.workFormat = mapWorkFormat(r)
  out.relocationReady = mapRelocation(r)
  out.businessTripsReady = mapBusinessTrips(r)

  return out
}

// Возвращает партиал для UPDATE/INSERT в candidates: только поля, для которых
// у нас есть осмысленное значение. Boolean/числовые null НЕ записываем,
// чтобы случайно не зануливать заполненные данные. Массивы пишем только если
// они непустые.
export function toCandidateColumns(fields: ExtractedHhFields): Record<string, unknown> {
  const cols: Record<string, unknown> = {}
  if (fields.city) cols.city = fields.city
  if (typeof fields.salaryMin === "number") cols.salaryMin = fields.salaryMin
  if (typeof fields.salaryMax === "number") cols.salaryMax = fields.salaryMax
  if (fields.birthDate) cols.birthDate = fields.birthDate
  if (typeof fields.experienceYears === "number") cols.experienceYears = fields.experienceYears
  if (fields.experience) cols.experience = fields.experience
  if (fields.educationLevel) cols.educationLevel = fields.educationLevel
  if (fields.workFormat) cols.workFormat = fields.workFormat
  if (Array.isArray(fields.keySkills) && fields.keySkills.length > 0) cols.keySkills = fields.keySkills
  if (Array.isArray(fields.skills) && fields.skills.length > 0) cols.skills = fields.skills
  if (Array.isArray(fields.languages) && fields.languages.length > 0) cols.languages = fields.languages
  if (typeof fields.relocationReady === "boolean") cols.relocationReady = fields.relocationReady
  if (typeof fields.businessTripsReady === "boolean") cols.businessTripsReady = fields.businessTripsReady
  return cols
}
