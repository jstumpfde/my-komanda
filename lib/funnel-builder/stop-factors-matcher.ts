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
  VacancyStopFactorNativeLanguage,
  VacancyStopFactorSalary,
} from "@/lib/db/schema"
import { expandContinentCode, isContinentCode } from "@/lib/funnel-builder/citizenship-countries"

export interface CandidateStopFactorData {
  city?:               string | null
  age?:                number | null
  experienceYears?:    number | null
  workFormat?:         "office" | "hybrid" | "remote" | null
  relocationReady?:    boolean | null
  salaryExpectation?:  number | null   // ожидаемая ЗП кандидата (resume.salary.amount)
  citizenship?:        string | null   // ISO-2 (RU/BY/...) — пока hh не отдаёт, оставлено для будущего
  nativeLanguages?:    string[] | null // коды hh (rus/eng/...) с level.id==="l1" (родной)
}

export interface StopFactorMatch {
  matched:       true
  factor:        "city" | "age" | "experience" | "format" | "citizenship" | "nativeLanguage" | "salaryExpectation"
  rejectionText: string
}

// ЮРИДИЧЕСКОЕ ПРИМЕЧАНИЕ (ТК РФ ст. 3, ст. 64; КоАП ст. 5.27, ст. 13.11.1):
// Называть кандидату защищённые признаки (возраст, гражданство, место жительства
// и др.) как причину отказа — НЕЗАКОННО. Все дефолтные тексты нейтральны и
// не раскрывают причину отсева. HR может задать кастомный rejectionText через
// UI — он тоже должен быть нейтральным.
function defaultRejection(_factor: StopFactorMatch["factor"]): string {
  return "{{name}}, спасибо за интерес к вакансии {{vacancy}}. Мы внимательно рассмотрели вашу заявку и продолжим работу с другими кандидатами. Благодарим и желаем успехов в поиске!"
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

// Континент-коды (напр. "continent:europe", "continent:cis") разворачиваются
// В МАТЧЕРЕ, а не при сохранении в UI. Причина: UI хранит компактный чип
// "continent:europe" — его легко показать/удалить одним чипом; если бы мы
// разворачивали при сохранении, редактирование потеряло бы группировку
// (пришлось бы держать отдельное поле "какие чипы были континентами").
// Разворот на лету дешёвый (статический словарь, никаких запросов).
function expandCodes(codes: string[]): Set<string> {
  const out = new Set<string>()
  for (const code of codes) {
    if (isContinentCode(code)) {
      for (const c of expandContinentCode(code)) out.add(c)
    } else {
      out.add(code.toUpperCase())
    }
  }
  return out
}

function matchCitizenship(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorCitizenship,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  if (!candidate.citizenship) return null
  const candidateCode = candidate.citizenship.toUpperCase()

  // mode отсутствует → легаси-поведение = allow (обратная совместимость со
  // старыми записями {enabled:true, allowed:[...]} без поля mode).
  const mode = factor.mode ?? "allow"

  if (mode === "deny") {
    const denied = factor.denied ?? []
    if (denied.length === 0) return null
    const deniedSet = expandCodes(denied)
    if (!deniedSet.has(candidateCode)) return null
    return {
      matched:       true,
      factor:        "citizenship",
      rejectionText: factor.rejectionText?.trim() || defaultRejection("citizenship"),
    }
  }

  // allow-режим (дефолт)
  const allowed = factor.allowed ?? []
  if (allowed.length === 0) return null
  const allowedSet = expandCodes(allowed)
  if (allowedSet.has(candidateCode)) return null
  return {
    matched:       true,
    factor:        "citizenship",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("citizenship"),
  }
}

// Родной язык — ПОЛНАЯ КОПИЯ логики matchCitizenship (allow/deny, легаси
// mode=allow при отсутствии поля), но без разворота континент-кодов
// (у языков групп нет — сравнение по прямому множеству кодов).
function matchNativeLanguage(
  candidate: CandidateStopFactorData,
  factor: VacancyStopFactorNativeLanguage,
): StopFactorMatch | null {
  if (!factor.enabled) return null
  const candidateLangs = candidate.nativeLanguages
  if (!candidateLangs || candidateLangs.length === 0) return null
  const candidateSet = new Set(candidateLangs.map(l => l.toLowerCase()))

  // mode отсутствует → легаси-поведение = allow (обратная совместимость,
  // как у гражданства).
  const mode = factor.mode ?? "allow"

  if (mode === "deny") {
    const denied = factor.denied ?? []
    if (denied.length === 0) return null
    const deniedSet = new Set(denied.map(c => c.toLowerCase()))
    const hasDenied = [...candidateSet].some(c => deniedSet.has(c))
    if (!hasDenied) return null
    return {
      matched:       true,
      factor:        "nativeLanguage",
      rejectionText: factor.rejectionText?.trim() || defaultRejection("nativeLanguage"),
    }
  }

  // allow-режим (дефолт): кандидат должен иметь ХОТЯ БЫ ОДИН родной язык
  // из разрешённого списка — иначе стоп.
  const allowed = factor.allowed ?? []
  if (allowed.length === 0) return null
  const allowedSet = new Set(allowed.map(c => c.toLowerCase()))
  const hasAllowed = [...candidateSet].some(c => allowedSet.has(c))
  if (hasAllowed) return null
  return {
    matched:       true,
    factor:        "nativeLanguage",
    rejectionText: factor.rejectionText?.trim() || defaultRejection("nativeLanguage"),
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

  // Единый текст отказа на весь блок (Юрий 08.07) приоритетнее пер-факторного
  // legacy-текста. Пусто → падаем на пер-факторный → на defaultRejection.
  const blockText = factors.rejectionText?.trim()
  const withBlock = (m: StopFactorMatch | null): StopFactorMatch | null => {
    if (m && blockText) m.rejectionText = blockText
    return m
  }

  if (factors.city)              { const m = withBlock(matchCity(candidate, factors.city));                 if (m) return m }
  if (factors.age)               { const m = withBlock(matchAge(candidate, factors.age));                   if (m) return m }
  if (factors.experience)        { const m = withBlock(matchExperience(candidate, factors.experience));     if (m) return m }
  if (factors.format)            { const m = withBlock(matchFormat(candidate, factors.format));             if (m) return m }
  if (factors.citizenship)       { const m = withBlock(matchCitizenship(candidate, factors.citizenship));   if (m) return m }
  if (factors.nativeLanguage)    { const m = withBlock(matchNativeLanguage(candidate, factors.nativeLanguage)); if (m) return m }
  if (factors.salaryExpectation) { const m = withBlock(matchSalary(candidate, factors.salaryExpectation));  if (m) return m }

  // documents — пока hh не отдаёт надёжно (мед. книжка / водительские права
  // в свободном тексте). Реализуется позже, когда добавим UI-анкету с явным
  // полем документов.

  return null
}
