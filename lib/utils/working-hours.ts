// Per-company рабочее время для cron-фильтрации.
// Используется в app/api/cron/hh-import/route.ts ДО вызовов hh API,
// чтобы не дёргать hh.ru ночью / в выходные / в праздники.
//
// Формат хранения — companies.working_hours JSONB (миграция 0092).
// Если поле NULL — берём DEFAULT_WORKING_HOURS.

export interface WorkingHoursSchedule {
  /** IANA timezone, например "Europe/Moscow", "Asia/Vladivostok". */
  tz: string
  /** ISO 8601 weekday: 1=Mon..7=Sun. */
  days: number[]
  /** "HH:MM" в локальном времени `tz`. */
  from: string
  /** "HH:MM" в локальном времени `tz`. Эксклюзивно (now < to). */
  to: string
  /** YYYY-MM-DD в локальном времени `tz`. */
  holidays?: string[]
}

export const DEFAULT_WORKING_HOURS: WorkingHoursSchedule = {
  tz:   "Europe/Moscow",
  days: [1, 2, 3, 4, 5],
  from: "09:00",
  to:   "21:00",
}

const ISO_WEEKDAY: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
}

/** Проверка: попадает ли `now` в рабочее время согласно `schedule`. */
export function isWorkingHours(
  schedule: WorkingHoursSchedule | null | undefined,
  now: Date = new Date(),
): boolean {
  const s = schedule ?? DEFAULT_WORKING_HOURS

  const parts: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: s.tz,
    year:    "numeric",
    month:   "2-digit",
    day:     "2-digit",
    hour:    "2-digit",
    minute:  "2-digit",
    weekday: "short",
    hour12:  false,
  }).formatToParts(now)) {
    if (p.type !== "literal") parts[p.type] = p.value
  }

  const ymd  = `${parts.year}-${parts.month}-${parts.day}`
  if (s.holidays?.includes(ymd)) return false

  const dow = ISO_WEEKDAY[parts.weekday]
  if (!dow || !s.days.includes(dow)) return false

  // Intl с hour12:false иногда возвращает "24" вместо "00" для полуночи.
  const hour = parts.hour === "24" ? "00" : parts.hour
  const hhmm = `${hour}:${parts.minute}`
  return hhmm >= s.from && hhmm < s.to
}

/** Лог-friendly строка для диагностики: "10:42 Mon Europe/Moscow". */
export function describeNowIn(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour:    "2-digit",
    minute:  "2-digit",
    weekday: "short",
    hour12:  false,
  }).format(now)
  return `${fmt} ${tz}`
}
