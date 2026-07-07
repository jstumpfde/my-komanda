// Мост между боевым хранилищем стоп-факторов (vacancies.stop_factors_json,
// формат VacancyStopFactors — объект с ключами city/format/age/experience/
// documents/citizenship/salaryExpectation) и упрощённым форматом конструктора
// вакансии (components/vacancies/anketa-tab.tsx, формат StopFactor[] —
// [{id, label, enabled, value?, ageRange?}]).
//
// КОНТЕКСТ (инцидент 07.07, вакансия 2604V023): раньше конструктор хранил
// стоп-факторы в descriptionJson.anketa.stopFactors — отдельном кармане,
// который НЕ читал process-queue (боевой отсев резюме hh.ru). Это давало
// HR иллюзию, что настройка работает, хотя рантайм её игнорировал. Теперь
// конструктор — ВЬЮХА боевого хранилища: читает/пишет через тот же API-роут
// (/api/modules/hr/vacancies/[id]/stop-factors), что и «Настройки вакансии»
// (components/vacancies/vacancy-stop-factors-settings.tsx). Эти функции —
// единственный официальный способ конвертации между форматами; не дублировать.
//
// Документы (VacancyStopFactorDocuments) сознательно НЕ покрыты матчером
// process-queue (см. комментарий в stop-factors-matcher.ts — hh не отдаёт
// поле надёжно), поэтому toAnketaStopFactors для id="documents" всегда
// показывает enabled:false, а fromAnketaStopFactors игнорирует этот id
// (ничего не пишет в боевой documents).

import type { VacancyStopFactors } from "@/lib/db/schema"

/** Формат одного стоп-фактора в конструкторе (components/vacancies/anketa-tab.tsx). */
export interface AnketaStopFactor {
  id: string
  label: string
  enabled: boolean
  value?: string
  ageRange?: [number, number]
  custom?: boolean
}

/** id-ы факторов конструктора, которые понимает конвертер (порядок — как в DEFAULT_STOP_FACTORS). */
export const ANKETA_STOP_FACTOR_IDS = [
  "age",
  "experience",
  "citizenship",
  "city",
  "format",
  "documents",
  "salaryMax",
] as const

export type AnketaStopFactorId = typeof ANKETA_STOP_FACTOR_IDS[number]

const LABELS: Record<AnketaStopFactorId, string> = {
  age:         "Возраст",
  experience:  "Опыт работы (мин. лет)",
  citizenship: "Гражданство",
  city:        "Город проживания",
  format:      "Формат работы",
  documents:   "Документы",
  salaryMax:   "Зарплата максимальная",
}

const DEFAULT_AGE_RANGE: [number, number] = [18, 65]

/** Базовый набор факторов конструктора — все выключены (совпадает с DEFAULT_STOP_FACTORS в anketa-tab.tsx). */
export function defaultAnketaStopFactors(): AnketaStopFactor[] {
  return ANKETA_STOP_FACTOR_IDS.map((id) =>
    id === "age"
      ? { id, label: LABELS[id], enabled: false, ageRange: DEFAULT_AGE_RANGE }
      : { id, label: LABELS[id], enabled: false },
  )
}

function formatLabel(f: "office" | "hybrid" | "remote"): string {
  return f === "office" ? "Офис" : f === "hybrid" ? "Гибрид" : "Удалёнка"
}

function citizenshipToText(c: VacancyStopFactors["citizenship"]): string {
  if (!c) return ""
  const mode = c.mode ?? "allow"
  const list = mode === "deny" ? (c.denied ?? []) : (c.allowed ?? [])
  if (list.length === 0) return ""
  return mode === "deny" ? `Кроме: ${list.join(", ")}` : list.join(", ")
}

/**
 * Боевое (VacancyStopFactors) → формат конструктора (AnketaStopFactor[]).
 * Всегда возвращает полный набор из ANKETA_STOP_FACTOR_IDS (выключенные —
 * с enabled:false), чтобы UI не терял строки для незаданных факторов.
 */
export function toAnketaStopFactors(boevoe: VacancyStopFactors | null | undefined): AnketaStopFactor[] {
  const sf = boevoe ?? {}
  return ANKETA_STOP_FACTOR_IDS.map((id): AnketaStopFactor => {
    const label = LABELS[id]
    switch (id) {
      case "age": {
        const a = sf.age
        const min = a?.minAge ?? DEFAULT_AGE_RANGE[0]
        const max = a?.maxAge ?? DEFAULT_AGE_RANGE[1]
        return { id, label, enabled: !!a?.enabled, ageRange: [min, max] }
      }
      case "experience": {
        const e = sf.experience
        return {
          id, label,
          enabled: !!e?.enabled,
          value: e?.minYears != null ? String(e.minYears) : undefined,
        }
      }
      case "citizenship": {
        const c = sf.citizenship
        return { id, label, enabled: !!c?.enabled, value: citizenshipToText(c) || undefined }
      }
      case "city": {
        const c = sf.city
        return {
          id, label,
          enabled: !!c?.enabled,
          value: (c?.allowedCities ?? []).length > 0 ? (c!.allowedCities as string[]).join(", ") : undefined,
        }
      }
      case "format": {
        const f = sf.format
        const allowed = f?.allowedFormats ?? []
        return {
          id, label,
          enabled: !!f?.enabled,
          value: allowed.length > 0 ? allowed.map(formatLabel).join(", ") : undefined,
        }
      }
      case "documents": {
        // Документы не участвуют в боевом матчере (см. комментарий вверху файла)
        // — конструктор показывает выключенным независимо от боевого хранилища.
        return { id, label, enabled: false }
      }
      case "salaryMax": {
        const s = sf.salaryExpectation
        return {
          id, label,
          enabled: !!s?.enabled,
          value: s?.maxAmount != null ? String(s.maxAmount) : undefined,
        }
      }
    }
  })
}

/**
 * Формат конструктора (AnketaStopFactor[]) → боевое (VacancyStopFactors),
 * MERGE поверх текущего боевого состояния `current` (сохраняет rejectionText
 * и прочие поля, не выражаемые в упрощённом UI конструктора; сохраняет
 * factor-ключи, отсутствующие в конструкторе, напр. nativeLanguage).
 *
 * id="documents" игнорируется намеренно (см. комментарий вверху файла) —
 * не трогает current.documents.
 * id="salaryMax" маппится на боевой ключ "salaryExpectation".
 *
 * Пустое value/ageRange при enabled=true сохраняет фактор включённым, но без
 * параметров — так же ведёт себя vacancy-stop-factors-settings.tsx (тумблер
 * включён, но пустой список/диапазон = фактор не отсекает никого, см.
 * stop-factors-matcher.ts — там же guard на пустые списки/undefined).
 */
export function fromAnketaStopFactors(
  factors: AnketaStopFactor[] | null | undefined,
  current?: VacancyStopFactors | null,
): VacancyStopFactors {
  const out: VacancyStopFactors = { ...(current ?? {}) }
  const byId = new Map((factors ?? []).map(f => [f.id, f]))

  const age = byId.get("age")
  if (age) {
    const [min, max] = age.ageRange ?? []
    out.age = { ...(out.age ?? {}), enabled: age.enabled, minAge: min, maxAge: max }
  }

  const experience = byId.get("experience")
  if (experience) {
    const minYears = experience.value != null && experience.value.trim() !== ""
      ? Number(experience.value)
      : undefined
    out.experience = {
      ...(out.experience ?? {}),
      enabled:  experience.enabled,
      minYears: Number.isFinite(minYears) ? minYears : undefined,
    }
  }

  const citizenship = byId.get("citizenship")
  if (citizenship) {
    // Свободный текст конструктора кодирует режим deny префиксом «Кроме:»
    // (см. citizenshipToText). ГВАРД-БЛОКЕР 07.07: раньше этот текст наивно
    // сплитился по запятой в allowed → на КАЖДОМ save() вкладки «Анкета»
    // (гидрация + безусловный fromAnketaStopFactors) deny-список round-trip'ом
    // превращался в мусор allowed=["Кроме: RU","BY"], а правки deny-списка
    // через конструктор не влияли на отсев (матчер в deny читает только
    // denied). Теперь: префикс «Кроме:» ИЛИ текущий боевой mode="deny" →
    // список пишем в denied (allowed не трогаем — сохраняется для истории,
    // как denied сохраняется в allow-режиме). Переключение режима allow/deny
    // из конструктора невозможно (упрощённый UI) — только через «Настройки
    // вакансии»/Портрет (CitizenshipFactorField).
    const raw = (citizenship.value ?? "").trim()
    const denyByPrefix = /^кроме\s*:/i.test(raw)
    const isDeny = denyByPrefix || out.citizenship?.mode === "deny"
    const listText = denyByPrefix ? raw.replace(/^кроме\s*:/i, "") : raw
    const list = listText.split(",").map(s => s.trim()).filter(Boolean)
    if (isDeny) {
      out.citizenship = {
        ...(out.citizenship ?? {}),
        enabled: citizenship.enabled,
        mode: "deny",
        ...(list.length > 0 ? { denied: list } : {}),
      }
    } else {
      out.citizenship = {
        ...(out.citizenship ?? {}),
        enabled: citizenship.enabled,
        ...(list.length > 0 ? { mode: "allow", allowed: list } : {}),
      }
    }
  }

  const city = byId.get("city")
  if (city) {
    const list = (city.value ?? "").split(",").map(s => s.trim()).filter(Boolean)
    out.city = {
      ...(out.city ?? {}),
      enabled:       city.enabled,
      allowedCities: list.length > 0 ? list : (out.city?.allowedCities ?? []),
    }
  }

  const format = byId.get("format")
  if (format) {
    const labelToId: Record<string, "office" | "hybrid" | "remote"> = {
      "офис": "office", "гибрид": "hybrid", "удалёнка": "remote", "удаленка": "remote",
    }
    const list = (format.value ?? "")
      .split(",")
      .map(s => labelToId[s.trim().toLowerCase()])
      .filter((v): v is "office" | "hybrid" | "remote" => !!v)
    out.format = {
      ...(out.format ?? {}),
      enabled:        format.enabled,
      allowedFormats: list.length > 0 ? list : (out.format?.allowedFormats ?? []),
    }
  }

  // documents — намеренно не трогаем (см. doc-комментарий вверху файла).

  const salaryMax = byId.get("salaryMax")
  if (salaryMax) {
    const maxAmount = salaryMax.value != null && salaryMax.value.trim() !== ""
      ? Number(salaryMax.value)
      : undefined
    out.salaryExpectation = {
      ...(out.salaryExpectation ?? {}),
      enabled:   salaryMax.enabled,
      maxAmount: Number.isFinite(maxAmount) ? maxAmount : undefined,
    }
  }

  return out
}

/** Сколько факторов конструктора реально включено — используется для computeStrictness. */
export function countEnabledAnketaStopFactors(factors: AnketaStopFactor[] | null | undefined): number {
  return (factors ?? []).filter(f => f.enabled).length
}

/**
 * Боевое → человекочитаемый список строк (для промпта AI-советника,
 * app/api/ai/vacancy-advisor/route.ts). Аналог structuralStops из
 * lib/core/spec/resume-input.ts, но по боевому формату (без driverLicense/
 * jobHopping/timezone — их там нет, см. VacancyStopFactors в lib/db/schema.ts).
 */
export function describeStopFactorsForPrompt(boevoe: VacancyStopFactors | null | undefined): string[] {
  const sf = boevoe ?? {}
  const out: string[] = []
  if (sf.city?.enabled && (sf.city.allowedCities ?? []).length > 0) {
    out.push(`Город: только ${sf.city.allowedCities!.join(", ")}`)
  }
  if (sf.format?.enabled && (sf.format.allowedFormats ?? []).length > 0) {
    out.push(`Формат работы: ${sf.format.allowedFormats!.map(formatLabel).join(", ")}`)
  }
  if (sf.age?.enabled && (sf.age.minAge != null || sf.age.maxAge != null)) {
    const parts = [
      sf.age.minAge != null ? `от ${sf.age.minAge}` : null,
      sf.age.maxAge != null ? `до ${sf.age.maxAge}` : null,
    ].filter(Boolean)
    out.push(`Возраст: ${parts.join(" ")} лет`)
  }
  if (sf.experience?.enabled && sf.experience.minYears != null) {
    out.push(`Опыт не менее ${sf.experience.minYears} лет`)
  }
  if (sf.citizenship?.enabled) {
    const text = citizenshipToText(sf.citizenship)
    if (text) out.push(`Гражданство: ${text}`)
  }
  if (sf.salaryExpectation?.enabled && sf.salaryExpectation.maxAmount != null) {
    out.push(`Зарплатные ожидания не выше ${sf.salaryExpectation.maxAmount.toLocaleString("ru-RU")} ₽`)
  }
  return out
}
