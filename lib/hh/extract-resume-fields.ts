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
  salaryCurrency?:     string | null   // RUR/RUB/EUR/USD/...
  // Контакты (из resume.contact[])
  phone?:              string | null
  email?:              string | null
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
  photoUrl?:           string | null
  // Доп. поля hh (миграция 0200)
  driverLicenses?:    string[]         // категории прав: ["A","B","C",...]
  hasVehicle?:        boolean | null
  citizenshipNames?:  string[]         // ["Россия","Беларусь",...]
  workTicketNames?:   string[]         // разрешение на работу
  professionalRoles?: string[]         // желаемые профроли/профобласти
  // legacy
  experience?:         string | null   // напр. "5 лет"
}

// Сырое резюме hh — как приходит из API (см. lib/hh-api.ts:HHFullResume)
type RawResume = {
  birth_date?: unknown
  age?: unknown
  contact?: Array<{
    type?: { id?: unknown }
    preferred?: unknown
    value?: { formatted?: unknown; email?: unknown } | null
  }> | unknown
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
  // Доп. поля hh (миграция 0200)
  driver_license_types?: Array<{ id?: unknown }> | unknown
  has_vehicle?: unknown
  citizenship?: Array<{ name?: unknown }> | unknown
  work_ticket?: Array<{ name?: unknown }> | unknown
  professional_roles?: Array<{ name?: unknown }> | unknown
  photo?: {
    small?:  unknown
    medium?: unknown
    big?:    unknown
    "100"?:  unknown
    "240"?:  unknown
    "500"?:  unknown
  } | null
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

// Парсит resume.contact[] → { phone, email }.
// hh отдаёт массив контактов с type.id = "cell" | "home" | "work" | "email".
// Предпочитаем контакт с preferred=true; в value — либо formatted (телефон), либо email.
function parseContacts(raw: RawResume): { phone: string | null; email: string | null } {
  if (!Array.isArray(raw.contact)) return { phone: null, email: null }
  const contacts = raw.contact as Array<{
    type?: { id?: unknown }
    preferred?: unknown
    value?: { formatted?: unknown; email?: unknown } | null
  }>

  let phone: string | null = null
  let email: string | null = null

  // Два прохода: сначала preferred=true, затем любой подходящего типа
  for (const pref of [true, false]) {
    for (const c of contacts) {
      const typeId = c.type?.id
      if (pref && c.preferred !== true) continue

      if (typeId === "cell" || typeId === "home" || typeId === "work") {
        if (!phone) {
          const formatted = c.value?.formatted
          if (isString(formatted)) phone = formatted
        }
      } else if (typeId === "email") {
        if (!email) {
          const emailVal = c.value?.email ?? c.value?.formatted
          if (isString(emailVal)) email = emailVal
        }
      }

      if (phone && email) break
    }
    if (phone && email) break
  }

  return { phone, email }
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
  const salaryCurrency = r.salary?.currency
  if (isString(salaryCurrency)) out.salaryCurrency = salaryCurrency

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

  // driver_license_types + has_vehicle
  if (Array.isArray(r.driver_license_types)) {
    const cats = (r.driver_license_types as Array<{ id?: unknown }>)
      .map(d => d?.id)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
    if (cats.length > 0) out.driverLicenses = cats
  }
  if (typeof r.has_vehicle === "boolean") out.hasVehicle = r.has_vehicle

  // citizenship
  if (Array.isArray(r.citizenship)) {
    const names = (r.citizenship as Array<{ name?: unknown }>)
      .map(c => c?.name)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
    if (names.length > 0) out.citizenshipNames = names
  }

  // work_ticket
  if (Array.isArray(r.work_ticket)) {
    const names = (r.work_ticket as Array<{ name?: unknown }>)
      .map(w => w?.name)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
    if (names.length > 0) out.workTicketNames = names
  }

  // professional_roles (желаемые профроли/профобласти)
  if (Array.isArray(r.professional_roles)) {
    const names = (r.professional_roles as Array<{ name?: unknown }>)
      .map(p => p?.name)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
    if (names.length > 0) out.professionalRoles = names
  }

  // contacts (phone / email) из resume.contact[]
  // Доступны только в полном резюме /resumes/{id}, не в preview из /negotiations.
  // COALESCE-семантика применяется на уровне вызывающего кода (process-queue,
  // client.ts) — здесь просто извлекаем то, что есть.
  const { phone: contactPhone, email: contactEmail } = parseContacts(r)
  if (contactPhone) out.phone = contactPhone
  if (contactEmail) out.email = contactEmail

  // photo: hh отдаёт несколько размеров {small,medium,big,100,240,500}.
  // Для UI кандидата лучше «среднего» размера: medium → 240 → big → 100 → small.
  // Если ни один не строка — null (нет фото).
  if (r.photo && typeof r.photo === "object") {
    const ph = r.photo
    const candidate =
      (isString(ph.medium) && ph.medium) ||
      (isString(ph["240"]) && ph["240"]) ||
      (isString(ph.big) && ph.big) ||
      (isString(ph["500"]) && ph["500"]) ||
      (isString(ph["100"]) && ph["100"]) ||
      (isString(ph.small) && ph.small) ||
      null
    out.photoUrl = candidate || null
  }

  return out
}

// Возвращает партиал для UPDATE/INSERT в candidates: только поля, для которых
// у нас есть осмысленное значение. Boolean/числовые null НЕ записываем,
// чтобы случайно не зануливать заполненные данные. Массивы пишем только если
// они непустые.
// ВАЖНО: phone/email включены сюда, но вызывающий код применяет
// COALESCE-семантику — не перезаписывает уже заполненные вручную значения.
export function toCandidateColumns(fields: ExtractedHhFields): Record<string, unknown> {
  const cols: Record<string, unknown> = {}
  if (fields.phone) cols.phone = fields.phone
  if (fields.email) cols.email = fields.email
  if (fields.city) cols.city = fields.city
  if (typeof fields.salaryMin === "number") cols.salaryMin = fields.salaryMin
  if (typeof fields.salaryMax === "number") cols.salaryMax = fields.salaryMax
  if (fields.salaryCurrency) cols.salaryCurrency = fields.salaryCurrency
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
  if (typeof fields.photoUrl === "string" && fields.photoUrl.length > 0) cols.photoUrl = fields.photoUrl
  // Доп. поля hh (миграция 0200)
  if (Array.isArray(fields.driverLicenses) && fields.driverLicenses.length > 0) cols.driverLicenses = fields.driverLicenses
  if (typeof fields.hasVehicle === "boolean") cols.hasVehicle = fields.hasVehicle
  if (Array.isArray(fields.citizenshipNames) && fields.citizenshipNames.length > 0) cols.citizenshipNames = fields.citizenshipNames
  if (Array.isArray(fields.workTicketNames) && fields.workTicketNames.length > 0) cols.workTicketNames = fields.workTicketNames
  if (Array.isArray(fields.professionalRoles) && fields.professionalRoles.length > 0) cols.professionalRoles = fields.professionalRoles
  return cols
}
