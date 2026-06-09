// Per-vacancy стоп-факторы (#61 finalization). Применяется в lib/hh/process-queue.ts
// после извлечения данных из hh-резюме и ДО AI-скоринга/invite.
//
// Возвращает null если ни один стоп-фактор не совпал, либо объект с factor +
// rejectionText, который вызывающий код использует для отправки сообщения и
// перевода кандидата в rejected.

import type {
  VacancyStopFactors,
  VacancyStopFactorCity,
  VacancyStopFactorFormat,
  VacancyStopFactorAge,
  VacancyStopFactorExperience,
  VacancyStopFactorCitizenship,
  VacancyStopFactorSalary,
} from "@/lib/db/schema"

export interface CandidateStopFactorData {
  city?:               string | null
  age?:                number | null
  experienceYears?:    number | null
  workFormat?:         "office" | "hybrid" | "remote" | null
  relocationReady?:    boolean | null
  salaryExpectation?:  number | null   // ожидаемая ЗП кандидата (resume.salary.amount)
  citizenship?:        string | null   // ISO-2 (RU/BY/...) — пока hh не отдаёт, оставлено для будущего
}

export interface StopFactorMatch {
  matched:       true
  factor:        "city" | "age" | "experience" | "format" | "citizenship" | "salaryExpectation"
  rejectionText: string
}

// ЮРИДИЧЕСКОЕ ПРИМЕЧАНИЕ (ТК РФ ст. 3, ст. 64; КоАП ст. 5.27, ст. 13.11.1):
// Называть кандидату защищённые признаки (возраст, гражданство, место жительства
// и др.) как причину отказа — НЕЗАКОННО. Все дефолтные тексты нейтральны и
// не раскрывают причину отсева. HR может задать кастомный rejectionText через
// UI — он тоже должен быть нейтральным.
function defaultRejection(_factor: StopFactorMatch["factor"]): string {
  return "К сожалению, по итогам рассмотрения мы продолжим работу с другими кандидатами. Благодарим за интерес к вакансии и желаем удачи в поиске!"
}

function matchCity(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorCity,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  const allowed = factor.allowedCities ?? []
  if (allowed.length === 0 || !candidate.city) return null
  const candidateCityLower = candidate.city.toLowerCase()
  const isAllowed = allowed.some(c => c.trim().toLowerCase() === candidateCityLower)
  if (isAllowed) return null
  // Релокация разрешена и кандидат готов переезжать — пропускаем.
  if (factor.allowRelocation && candidate.relocationReady === true) return null
  return {
    matched:       true,
    factor:        "city",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("city"),
  }
}

function matchAge(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorAge,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  if (typeof candidate.age !== "number") return null
  const min = factor.minAge
  const max = factor.maxAge
  const tooYoung = typeof min === "number" && candidate.age < min
  const tooOld   = typeof max === "number" && candidate.age > max
  if (!tooYoung && !tooOld) return null
  return {
    matched:       true,
    factor:        "age",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("age"),
  }
}

function matchExperience(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorExperience,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  if (typeof factor.minYears !== "number" || factor.minYears <= 0) return null
  if (typeof candidate.experienceYears !== "number") return null
  if (candidate.experienceYears >= factor.minYears) return null
  return {
    matched:       true,
    factor:        "experience",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("experience"),
  }
}

function matchFormat(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorFormat,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  const allowed = factor.allowedFormats ?? []
  if (allowed.length === 0 || !candidate.workFormat) return null
  if (allowed.includes(candidate.workFormat)) return null
  return {
    matched:       true,
    factor:        "format",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("format"),
  }
}

function matchCitizenship(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorCitizenship,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  const allowed = factor.allowed ?? []
  if (allowed.length === 0 || !candidate.citizenship) return null
  if (allowed.includes(candidate.citizenship)) return null
  return {
    matched:       true,
    factor:        "citizenship",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("citizenship"),
  }
}

function matchSalary(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorSalary,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  if (typeof factor.maxAmount !== "number" || factor.maxAmount <= 0) return null
  if (typeof candidate.salaryExpectation !== "number") return null
  if (candidate.salaryExpectation <= factor.maxAmount) return null
  return {
    matched:       true,
    factor:        "salaryExpectation",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("salaryExpectation"),
  }
}

export function matchStopFactors(
  candidate: CandidateStopFactorData,
  factors: VacancyStopFactors | null | undefined,
): StopFactorMatch | null {
  if (!factors || Object.keys(factors).length === 0) return null

  if (factors.city)              { const m = matchCity(candidate, factors.city);                 if (m) return m }
  if (factors.age)               { const m = matchAge(candidate, factors.age);                   if (m) return m }
  if (factors.experience)        { const m = matchExperience(candidate, factors.experience);     if (m) return m }
  if (factors.format)            { const m = matchFormat(candidate, factors.format);             if (m) return m }
  if (factors.citizenship)       { const m = matchCitizenship(candidate, factors.citizenship);   if (m) return m }
  if (factors.salaryExpectation) { const m = matchSalary(candidate, factors.salaryExpectation);  if (m) return m }

  // documents — пока hh не отдаёт надёжно (мед. книжка / водительские права
  // в свободном тексте). Реализуется позже, когда добавим UI-анкету с явным
  // полем документов.

  return null
}
