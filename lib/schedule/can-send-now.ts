import { RU_HOLIDAYS } from "./holidays"
import { getHolidaysForCountry } from "@/lib/holidays"

// ─── Helpers для TZ-arithmetic ────────────────────────────────────────────
// Возвращает поля даты в указанной IANA TZ.
function partsInTz(date: Date, tz: string): {
  year: string; month: string; day: string;
  hour: string; minute: string; weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value])) as any
}

// Сколько минут добавить к "локальному" времени в этой TZ, чтобы получить UTC.
// Например, для Europe/Moscow вернёт -180 (Москва впереди UTC на 3 часа).
function tzOffsetMinutes(date: Date, tz: string): number {
  const p = partsInTz(date, tz)
  const localAsUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute),
  )
  return Math.round((date.getTime() - localAsUtc) / 60_000)
}

// Из локальных компонент даты в указанной TZ собирает UTC Date.
function makeDateInTz(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  // Берём первое приближение: считаем, что компоненты — это UTC.
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute))
  // Узнаём, какой offset у этой TZ в этой точке (учитывает DST если есть).
  const offset = tzOffsetMinutes(probe, tz)
  // Сдвигаем probe на offset минут вперёд, чтобы partsInTz вернул нужные компоненты.
  return new Date(probe.getTime() + offset * 60_000)
}

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
  scheduleLunchEnabled?:       boolean | null
  scheduleLunchFrom?:          string  | null   // "HH:MM"
  scheduleLunchTo?:            string  | null   // "HH:MM"
  scheduleCountry?:            string  | null   // "RU" | "KZ" | "UZ" | "BY"
}

export type CanSendReason =
  | "off_hours"
  | "non_working_day"
  | "custom_holiday"
  | "lunch_break"
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

  // 1b. Обеденный перерыв — проверяем сразу после часов, до дней недели.
  if (
    vacancy.scheduleLunchEnabled &&
    vacancy.scheduleLunchFrom &&
    vacancy.scheduleLunchTo &&
    currentTime >= vacancy.scheduleLunchFrom &&
    currentTime < vacancy.scheduleLunchTo
  ) {
    return { allowed: false, reason: "lunch_break" }
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

  // 3. Праздники — ветвление по стране.
  const country = vacancy.scheduleCountry || "RU"
  if (country !== "RU") {
    // Не-RU страна: используем getHolidaysForCountry (формат "DD.MM").
    const ddmm = `${parts.day}.${parts.month}`
    if (getHolidaysForCountry(country as Parameters<typeof getHolidaysForCountry>[0]).some((h) => h.date === ddmm)) {
      return { allowed: false, reason: `holiday_${country.toLowerCase()}` as CanSendReason }
    }
  } else {
    // RU (или пусто): старая логика RU_HOLIDAYS + excludedIds — без изменений.
    const month = Number.parseInt(parts.month, 10)
    const day   = Number.parseInt(parts.day, 10)
    const excludedIds = vacancy.scheduleExcludedHolidayIds && vacancy.scheduleExcludedHolidayIds.length > 0
      ? vacancy.scheduleExcludedHolidayIds
      : DEFAULT_EXCLUDED_HOLIDAY_IDS
    const todayHoliday = RU_HOLIDAYS.find((h) => h.month === month && h.day === day)
    if (todayHoliday && excludedIds.includes(todayHoliday.id)) {
      return { allowed: false, reason: `holiday_${todayHoliday.id}` }
    }
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

// ─── adjustToWorkingWindow ────────────────────────────────────────────────
// В отличие от canSendNow (которая только говорит «можно/нельзя сейчас»),
// эта функция СДВИГАЕТ переданную дату вперёд до ближайшего разрешённого
// слота в окне работы вакансии. Используется в шедулере дожима, чтобы
// все scheduled_at гарантированно попадали в рабочие часы/дни вакансии.
//
// Если scheduleEnabled=false — применяется дефолтное окно (09:00–20:00 МСК,
// Пн-Пт, стандартные RU-праздники).
//
// Возвращает {adjusted, reason}:
//   in_window           — date уже была в окне, не сдвигали.
//   off_hours_moved     — попала вне часов, перенесли на start того же
//                         или следующего рабочего дня.
//   non_working_day_moved — выходной (например, суббота).
//   holiday_moved       — попадала на стандартный праздник РФ.
//   custom_holiday_moved — попадала в кастомный период (отпуск компании).

export type AdjustReason =
  | "in_window"
  | "off_hours_moved"
  | "non_working_day_moved"
  | "holiday_moved"
  | "custom_holiday_moved"
  | "lunch_moved"

export interface AdjustResult {
  adjusted: Date
  reason:   AdjustReason
}

const WEEKDAY_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

// Дефолтное окно для случая, когда у вакансии scheduleEnabled=false.
// Совпадает с продуктовым требованием Сессии 4 (09:00–20:00 МСК, Пн-Пт).
const FALLBACK_DEFAULTS = {
  start:    "09:00",
  end:      "20:00",
  timezone: "Europe/Moscow",
}

export function adjustToWorkingWindow(date: Date, vacancy: VacancySchedule): AdjustResult {
  // Если у вакансии расписание выключено — используем дефолт продукта (МСК 09–20).
  const useDefaults = !vacancy.scheduleEnabled
  const tz    = useDefaults ? FALLBACK_DEFAULTS.timezone : (vacancy.scheduleTimezone || FALLBACK_DEFAULTS.timezone)
  const start = useDefaults ? FALLBACK_DEFAULTS.start    : (vacancy.scheduleStart    || FALLBACK_DEFAULTS.start)
  const end   = useDefaults ? FALLBACK_DEFAULTS.end      : (vacancy.scheduleEnd      || FALLBACK_DEFAULTS.end)
  const workingDays = (!useDefaults && vacancy.scheduleWorkingDays && vacancy.scheduleWorkingDays.length > 0)
    ? vacancy.scheduleWorkingDays
    : DEFAULT_WORKING_DAYS
  const excludedIds = (!useDefaults && vacancy.scheduleExcludedHolidayIds && vacancy.scheduleExcludedHolidayIds.length > 0)
    ? vacancy.scheduleExcludedHolidayIds
    : DEFAULT_EXCLUDED_HOLIDAY_IDS
  const customHolidays = (!useDefaults && vacancy.scheduleCustomHolidays) ? vacancy.scheduleCustomHolidays : []
  const country = (!useDefaults && vacancy.scheduleCountry) ? vacancy.scheduleCountry : "RU"

  // Минута к началу окна (например, "09:00" → 540) — для сравнения "HH:MM".
  const startTimeStr = start
  // const endTimeStr   = end  // используется в сравнениях ниже как `end`

  let current = new Date(date)
  let firstReason: AdjustReason | null = null
  // Защита от бесконечного цикла (несконсистентная конфигурация — например,
  // все 7 дней нерабочие; такого быть не должно, но safety net не повредит).
  for (let safety = 0; safety < 365; safety++) {
    const p = partsInTz(current, tz)
    const today = WEEKDAY_MAP[p.weekday]
    const isoDay = `${p.year}-${p.month}-${p.day}`
    const currentTime = `${p.hour}:${p.minute}`

    // 1. Нерабочий день недели → следующий день в start.
    if (!workingDays.includes(today)) {
      firstReason ??= "non_working_day_moved"
      current = nextDayStart(current, tz, startTimeStr)
      continue
    }

    // 2. Праздник → следующий день в start.
    if (country !== "RU") {
      // Не-RU: сверяемся с getHolidaysForCountry (формат "DD.MM").
      const ddmm = `${p.day}.${p.month}`
      if (getHolidaysForCountry(country as Parameters<typeof getHolidaysForCountry>[0]).some((h) => h.date === ddmm)) {
        firstReason ??= "holiday_moved"
        current = nextDayStart(current, tz, startTimeStr)
        continue
      }
    } else {
      // RU: старая логика RU_HOLIDAYS + excludedIds — без изменений.
      const month = Number(p.month)
      const day   = Number(p.day)
      const stdHoliday = RU_HOLIDAYS.find((h) => h.month === month && h.day === day)
      if (stdHoliday && excludedIds.includes(stdHoliday.id)) {
        firstReason ??= "holiday_moved"
        current = nextDayStart(current, tz, startTimeStr)
        continue
      }
    }

    // 3. Кастомный период (отпуск компании) → день после окончания периода.
    const custom = customHolidays.find((c) => c.from <= isoDay && isoDay <= c.to)
    if (custom) {
      firstReason ??= "custom_holiday_moved"
      // Прыгаем на день после `custom.to` в start.
      const [cy, cm, cd] = custom.to.split("-").map(Number)
      const dayAfter = makeDateInTz(cy, cm, cd + 1, Number(startTimeStr.slice(0, 2)), Number(startTimeStr.slice(3, 5)), tz)
      current = dayAfter
      continue
    }

    // 4. До открытия окна → сдвиг к start того же дня.
    if (currentTime < startTimeStr) {
      firstReason ??= "off_hours_moved"
      current = sameDayAt(current, tz, startTimeStr)
      continue
    }

    // 4b. Обеденный перерыв — внутри рабочего окна → сдвигаем на конец обеда.
    const lunchOn = !useDefaults && vacancy.scheduleLunchEnabled && vacancy.scheduleLunchFrom && vacancy.scheduleLunchTo
    if (lunchOn && currentTime >= vacancy.scheduleLunchFrom! && currentTime < vacancy.scheduleLunchTo!) {
      firstReason ??= "lunch_moved"
      current = sameDayAt(current, tz, vacancy.scheduleLunchTo!)
      continue
    }

    // 5. После закрытия окна → следующий день в start.
    if (currentTime > end) {
      firstReason ??= "off_hours_moved"
      current = nextDayStart(current, tz, startTimeStr)
      continue
    }

    // Всё ок.
    return { adjusted: current, reason: firstReason ?? "in_window" }
  }

  return { adjusted: current, reason: firstReason ?? "in_window" }
}

function sameDayAt(date: Date, tz: string, hhmm: string): Date {
  const p = partsInTz(date, tz)
  const [h, m] = hhmm.split(":").map(Number)
  return makeDateInTz(Number(p.year), Number(p.month), Number(p.day), h, m, tz)
}

function nextDayStart(date: Date, tz: string, hhmm: string): Date {
  const p = partsInTz(date, tz)
  const [h, m] = hhmm.split(":").map(Number)
  return makeDateInTz(Number(p.year), Number(p.month), Number(p.day) + 1, h, m, tz)
}
