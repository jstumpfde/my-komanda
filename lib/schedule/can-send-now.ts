import { RU_HOLIDAYS } from "./holidays"

// Расписание отправки сообщений на уровне вакансии.
// Все поля опциональны — отсутствие colum'а в выборке = поведение по умолчанию.
export interface VacancySchedule {
  scheduleEnabled?:            boolean | null
  scheduleStart?:              string  | null   // "HH:MM"
  scheduleEnd?:                string  | null   // "HH:MM"
  scheduleTimezone?:           string  | null   // IANA, "Europe/Moscow"
  scheduleWorkingDays?:        number[] | null  // 1=Пн ... 7=Вс
  scheduleExcludedHolidayIds?: string[] | null  // совпадает с RU_HOLIDAYS[].id
  scheduleCustomHolidays?:     { from: string; to: string; label: string }[] | null
}

export type CanSendReason =
  | "off_hours"
  | "non_working_day"
  | "custom_holiday"
  | `holiday_${string}`

export interface CanSendNowResult {
  allowed: boolean
  reason?: CanSendReason
}

// Default-значения, совпадающие с DEFAULT в миграции 0082.
const DEFAULT_WORKING_DAYS: number[] = [1, 2, 3, 4, 5]
const DEFAULT_EXCLUDED_HOLIDAY_IDS: string[] = RU_HOLIDAYS.map((h) => h.id)
const DEFAULTS = {
  start:    "09:00",
  end:      "19:55",
  timezone: "Europe/Moscow",
}

// Возвращает {allowed, reason}. Если расписание выключено — всегда allowed.
// Использует Intl.DateTimeFormat для корректной работы с TZ вакансии,
// независимо от TZ сервера (на проде сервер обычно UTC).
export function canSendNow(vacancy: VacancySchedule, now: Date = new Date()): CanSendNowResult {
  if (!vacancy.scheduleEnabled) return { allowed: true }

  const tz    = vacancy.scheduleTimezone || DEFAULTS.timezone
  const start = vacancy.scheduleStart    || DEFAULTS.start
  const end   = vacancy.scheduleEnd      || DEFAULTS.end

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year:    "numeric",
    month:   "2-digit",
    day:     "2-digit",
    hour:    "2-digit",
    minute:  "2-digit",
    weekday: "short",
    hour12:  false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))

  // 1. Часы (формат "HH:MM" сравнивается лексикографически — корректно).
  const currentTime = `${parts.hour}:${parts.minute}`
  if (currentTime < start || currentTime > end) {
    return { allowed: false, reason: "off_hours" }
  }

  // 2. Дни недели — Intl выдаёт "Mon"…"Sun".
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const today = weekdayMap[parts.weekday]
  const workingDays = vacancy.scheduleWorkingDays && vacancy.scheduleWorkingDays.length > 0
    ? vacancy.scheduleWorkingDays
    : DEFAULT_WORKING_DAYS
  if (!workingDays.includes(today)) {
    return { allowed: false, reason: "non_working_day" }
  }

  // 3. Стандартные праздники РФ — блокируем только те, что отмечены в excluded.
  const month = Number.parseInt(parts.month, 10)
  const day   = Number.parseInt(parts.day, 10)
  const excludedIds = vacancy.scheduleExcludedHolidayIds && vacancy.scheduleExcludedHolidayIds.length > 0
    ? vacancy.scheduleExcludedHolidayIds
    : DEFAULT_EXCLUDED_HOLIDAY_IDS
  const todayHoliday = RU_HOLIDAYS.find((h) => h.month === month && h.day === day)
  if (todayHoliday && excludedIds.includes(todayHoliday.id)) {
    return { allowed: false, reason: `holiday_${todayHoliday.id}` }
  }

  // 4. Кастомные периоды (отпуска компании, корпоративы и т.п.).
  // Сравнение строк "YYYY-MM-DD" работает лексикографически.
  const isoToday = `${parts.year}-${parts.month}-${parts.day}`
  const custom = vacancy.scheduleCustomHolidays || []
  for (const c of custom) {
    if (c.from <= isoToday && isoToday <= c.to) {
      return { allowed: false, reason: "custom_holiday" }
    }
  }

  return { allowed: true }
}
