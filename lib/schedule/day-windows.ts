// Окна доступности для записи кандидатов по дням недели.
// Единый резолвер + генератор слотов — используется публичной страницей
// самозаписи (/schedule/[token]) и её API-роутом.
//
// Источник правды — CompanyHiringDefaults.schedule.interviewDaySchedule
// (по дню недели, у дня несколько диапазонов). Если поле отсутствует —
// деривим из legacy-полей interviewDays/interviewFrom/interviewTo/lunch*.

import type { CompanyHiringDefaults, InterviewTimeRange } from "@/lib/db/schema"

export type { InterviewTimeRange }

export const DAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type DayId = (typeof DAY_IDS)[number]

// day-id → JS-день недели (0=Вс)
export const DAY_ID_TO_JS: Record<DayId, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}
// JS-день недели (0=Вс) → day-id
export const JS_TO_DAY_ID: Record<number, DayId> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
}

export type DaySchedule = Record<DayId, InterviewTimeRange[]>

const DEFAULT_DAYS: DayId[] = ["mon", "tue", "wed", "thu", "fri"]
const DEFAULT_FROM = "09:00"
const DEFAULT_TO   = "18:00"

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function emptySchedule(): DaySchedule {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

/**
 * Возвращает окна доступности по дням недели.
 * Если interviewDaySchedule задан — используем его напрямую.
 * Иначе деривим из legacy-полей (backward-compat):
 *   для каждого дня из interviewDays →
 *     lunchEnabled: [{interviewFrom..lunchFrom}, {lunchTo..interviewTo}]
 *     иначе:        [{interviewFrom..interviewTo}]
 *   дни не из interviewDays → []
 */
export function resolveDaySchedule(
  sched: NonNullable<CompanyHiringDefaults["schedule"]> | undefined | null,
): DaySchedule {
  const s = sched ?? {}

  if (s.interviewDaySchedule) {
    const src = s.interviewDaySchedule
    const out = emptySchedule()
    for (const day of DAY_IDS) {
      const ranges = Array.isArray(src[day]) ? src[day] : []
      out[day] = ranges
        .filter(r => r && typeof r.from === "string" && typeof r.to === "string"
          && timeToMinutes(r.from) < timeToMinutes(r.to))
        .map(r => ({ from: r.from, to: r.to }))
    }
    return out
  }

  // ── Legacy-деривация ──
  const enabledDays = (s.interviewDays?.length ? s.interviewDays : DEFAULT_DAYS) as DayId[]
  const from = s.interviewFrom ?? DEFAULT_FROM
  const to   = s.interviewTo   ?? DEFAULT_TO
  const lunchEnabled = s.lunchEnabled ?? false
  const lunchFrom = s.lunchFrom ?? "13:00"
  const lunchTo   = s.lunchTo   ?? "14:00"

  const dayWindows: InterviewTimeRange[] = lunchEnabled
    ? [{ from, to: lunchFrom }, { from: lunchTo, to }]
    : [{ from, to }]
  // фильтр вырожденных диапазонов (from<to)
  const validWindows = dayWindows.filter(w => timeToMinutes(w.from) < timeToMinutes(w.to))

  const out = emptySchedule()
  for (const day of DAY_IDS) {
    out[day] = enabledDays.includes(day) ? validWindows.map(w => ({ ...w })) : []
  }
  return out
}

/**
 * Генерирует слоты внутри набора окон дня.
 * Шаг step, длительность встречи duration. Слот помещается, только если
 * cur+duration <= конец окна. Слоты отсортированы по времени.
 */
export function generateSlotsForWindows(
  windows: InterviewTimeRange[],
  step: number,
  duration: number,
): string[] {
  const out: string[] = []
  const sorted = [...windows]
    .map(w => ({ from: timeToMinutes(w.from), to: timeToMinutes(w.to) }))
    .filter(w => w.from < w.to)
    .sort((a, b) => a.from - b.from)

  for (const w of sorted) {
    for (let cur = w.from; cur + duration <= w.to; cur += step) {
      out.push(minutesToTime(cur))
    }
  }
  return out
}

// ─── Per-вакансия окна записи (#21) ──────────────────────────────────────────
// У вакансии могут быть свои окна (descriptionJson.interviewDaySchedule),
// перекрывающие company-level. Если не заданы — company fallback (resolveDaySchedule).

export const DAY_LABELS_RU: Record<DayId, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
}

/** Расписание окон по дням недели (per-вакансия). Ключ отсутствует/пустой массив = выходной. */
export type InterviewDaySchedule = Partial<Record<DayId, InterviewTimeRange[]>>

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Нормализует произвольный JSON к валидному InterviewDaySchedule: отбрасывает
 * мусор, невалидный формат времени, диапазоны from>=to; сортирует по началу.
 * Возвращает null, если ничего валидного нет.
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
      if (typeof from !== "string" || !HHMM_RE.test(from)) continue
      if (typeof to !== "string"   || !HHMM_RE.test(to))   continue
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

/**
 * Окна записи для ВАКАНСИИ: если у вакансии заданы свои окна
 * (descriptionJson.interviewDaySchedule) — берём их; иначе company-level fallback.
 */
export function resolveVacancyDaySchedule(
  vacancyInterviewDaySchedule: unknown,
  companySched: NonNullable<CompanyHiringDefaults["schedule"]> | undefined | null,
): DaySchedule {
  const perVacancy = normalizeInterviewDaySchedule(vacancyInterviewDaySchedule)
  if (perVacancy) {
    const out = emptySchedule()
    for (const day of DAY_IDS) out[day] = perVacancy[day] ?? []
    return out
  }
  return resolveDaySchedule(companySched)
}
