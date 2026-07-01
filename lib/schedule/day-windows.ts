// Окна записи на интервью по дням недели (мульти-диапазон).
//
// Зеркало company-level #12, но с per-vacancy переопределением: вакансия может
// задать свои окна записи (descriptionJson.interviewDaySchedule); если не задано —
// генератор слотов берёт общие company-level настройки (hiringDefaults.schedule).
//
// Единая точка правды для генераторов слотов:
//   • app/(public)/schedule/[token]/schedule-data.ts (серверный компонент)
//   • app/api/public/schedule/[token]/route.ts (GET)
//
// Формат хранения — компактный: массив диапазонов на каждый день недели.
// День без диапазонов = нерабочий (слоты не предлагаются).

// ─── Типы ─────────────────────────────────────────────────────────────────────

/** Идентификаторы дней недели (совпадают с company-level interviewDays). */
export type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export const DAY_IDS: DayId[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export const DAY_LABELS_RU: Record<DayId, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
}

/** JS getDay() (0=Вс..6=Сб) → DayId. */
export const JS_DAY_TO_ID: Record<number, DayId> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
}

/** Один диапазон времени в пределах дня, напр. «до обеда» 09:00–13:00. */
export interface InterviewTimeRange {
  from: string  // "HH:MM"
  to:   string  // "HH:MM"
}

/**
 * Расписание окон записи по дням недели.
 * Ключ отсутствует или пустой массив = день нерабочий (слотов нет).
 * Несколько диапазонов на день = мульти-окно (до обеда / после обеда).
 */
export type InterviewDaySchedule = Partial<Record<DayId, InterviewTimeRange[]>>

// ─── Валидация / нормализация ───────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Приводит произвольный JSON к валидному InterviewDaySchedule.
 * Отбрасывает мусор, диапазоны с from>=to, невалидный формат времени.
 * Сортирует диапазоны по времени начала. Возвращает null, если ничего валидного нет.
 */
export function normalizeInterviewDaySchedule(raw: unknown): InterviewDaySchedule | null {
  if (!raw || typeof raw !== "object") return null
  const src = raw as Record<string, unknown>
  const out: InterviewDaySchedule = {}
  let hasAny = false

  for (const day of DAY_IDS) {
    const list = src[day]
    if (!Array.isArray(list)) continue
    const ranges: InterviewTimeRange[] = []
    for (const r of list) {
      if (!r || typeof r !== "object") continue
      const from = (r as { from?: unknown }).from
      const to   = (r as { to?: unknown }).to
      if (typeof from !== "string" || !HHMM.test(from)) continue
      if (typeof to !== "string"   || !HHMM.test(to))   continue
      if (timeToMinutes(from) >= timeToMinutes(to)) continue
      ranges.push({ from, to })
    }
    if (ranges.length > 0) {
      ranges.sort((a, b) => timeToMinutes(a.from) - timeToMinutes(b.from))
      out[day] = ranges
      hasAny = true
    }
  }

  return hasAny ? out : null
}

/** Задан ли у вакансии хоть один рабочий день с окнами. */
export function hasInterviewDaySchedule(raw: unknown): boolean {
  return normalizeInterviewDaySchedule(raw) !== null
}

// ─── Резолвер company-level fallback ───────────────────────────────────────────

/** Плоские company-level настройки записи (hiringDefaults.schedule). */
export interface CompanyScheduleFallback {
  interviewDays?: string[]        // ["mon","tue",...]
  interviewFrom?: string          // "09:00"
  interviewTo?:   string          // "18:00"
  lunchEnabled?:  boolean
  lunchFrom?:     string          // "13:00"
  lunchTo?:       string          // "14:00"
}

const DEFAULT_DAYS: DayId[] = ["mon", "tue", "wed", "thu", "fri"]
const DEFAULT_FROM = "09:00"
const DEFAULT_TO   = "18:00"

/**
 * Строит per-day расписание окон из плоских company-level настроек.
 * Каждый рабочий день получает единственный диапазон [from, to]; если включён
 * обед — диапазон разбивается на два (до обеда / после обеда).
 */
export function daysScheduleFromCompanyFallback(
  company: CompanyScheduleFallback,
): InterviewDaySchedule {
  const days = (company.interviewDays?.length ? company.interviewDays : DEFAULT_DAYS)
    .filter((d): d is DayId => (DAY_IDS as string[]).includes(d))
  const from = HHMM.test(company.interviewFrom ?? "") ? company.interviewFrom! : DEFAULT_FROM
  const to   = HHMM.test(company.interviewTo   ?? "") ? company.interviewTo!   : DEFAULT_TO

  const lunchEnabled = company.lunchEnabled === true
  const lunchFrom = HHMM.test(company.lunchFrom ?? "") ? company.lunchFrom! : "13:00"
  const lunchTo   = HHMM.test(company.lunchTo   ?? "") ? company.lunchTo!   : "14:00"

  // Разбиваем [from,to] обедом на диапазоны (если обед внутри окна).
  const buildRanges = (): InterviewTimeRange[] => {
    if (!lunchEnabled) return [{ from, to }]
    const fMin = timeToMinutes(from), tMin = timeToMinutes(to)
    const lfMin = timeToMinutes(lunchFrom), ltMin = timeToMinutes(lunchTo)
    // Обед вне рабочего окна — не режем.
    if (ltMin <= fMin || lfMin >= tMin) return [{ from, to }]
    const ranges: InterviewTimeRange[] = []
    if (lfMin > fMin) ranges.push({ from, to: lunchFrom })
    if (ltMin < tMin) ranges.push({ from: lunchTo, to })
    return ranges.length > 0 ? ranges : [{ from, to }]
  }

  const ranges = buildRanges()
  const out: InterviewDaySchedule = {}
  for (const d of days) out[d] = ranges
  return out
}

/**
 * Итоговое расписание окон для генерации слотов.
 * Если у вакансии заданы свои окна (vacancyRaw) — берём ИХ; иначе company-level.
 */
export function resolveDaySchedule(
  vacancyRaw: unknown,
  company: CompanyScheduleFallback,
): InterviewDaySchedule {
  const own = normalizeInterviewDaySchedule(vacancyRaw)
  if (own) return own
  return daysScheduleFromCompanyFallback(company)
}

/**
 * Возвращает диапазоны окон для конкретного дня недели (по JS getDay()).
 * Пустой массив = день нерабочий.
 */
export function rangesForJsDay(schedule: InterviewDaySchedule, jsDay: number): InterviewTimeRange[] {
  const id = JS_DAY_TO_ID[jsDay]
  return id ? (schedule[id] ?? []) : []
}
