// Helpers для проверки рабочих часов вакансии.
// Источники данных, в порядке приоритета:
//   1. Колонки vacancies.working_hours_*  (новый, дефолт)
//   2. descriptionJson.automation.workingHours = { enabled, from, to } (legacy)
//
// Время в JS-зоне БРАТЬ НЕЛЬЗЯ — сервер может быть в UTC, а вакансия —
// «по Москве». Используем Intl.DateTimeFormat с timeZone из vacancy.

export interface WorkingHoursConfig {
  enabled:  boolean
  start:    string   // "HH:MM"
  end:      string   // "HH:MM"
  timezone: string   // IANA, например "Europe/Moscow"
}

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  enabled:  false,
  start:    "09:00",
  end:      "19:55",
  timezone: "Europe/Moscow",
}

// Достаёт рабочие часы из строки vacancies.
// Принимает minimum-shape, чтобы было можно вызвать с кусочной выборкой.
export function resolveWorkingHours(vacancy: {
  workingHoursEnabled?:   boolean | null
  workingHoursStart?:     string  | null
  workingHoursEnd?:       string  | null
  workingHoursTimezone?:  string  | null
  descriptionJson?:       unknown
}): WorkingHoursConfig {
  // Колонки имеют приоритет.
  if (typeof vacancy.workingHoursEnabled === "boolean") {
    return {
      enabled:  vacancy.workingHoursEnabled,
      start:    vacancy.workingHoursStart    || DEFAULT_WORKING_HOURS.start,
      end:      vacancy.workingHoursEnd      || DEFAULT_WORKING_HOURS.end,
      timezone: vacancy.workingHoursTimezone || DEFAULT_WORKING_HOURS.timezone,
    }
  }
  // Legacy fallback.
  const dj = vacancy.descriptionJson as { automation?: { workingHours?: { enabled?: boolean; from?: string; to?: string } } } | null | undefined
  const wh = dj?.automation?.workingHours
  if (wh && typeof wh.enabled === "boolean") {
    return {
      enabled:  wh.enabled,
      start:    wh.from || DEFAULT_WORKING_HOURS.start,
      end:      wh.to   || DEFAULT_WORKING_HOURS.end,
      timezone: DEFAULT_WORKING_HOURS.timezone,
    }
  }
  return DEFAULT_WORKING_HOURS
}

// Текущее время в часовом поясе вакансии в формате "HH:MM".
function currentTimeInTz(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).format(now)
}

// Можно ли сейчас слать сообщение по этой вакансии?
export function canSendNow(
  vacancy: Parameters<typeof resolveWorkingHours>[0],
  now: Date = new Date(),
): boolean {
  const wh = resolveWorkingHours(vacancy)
  if (!wh.enabled) return true

  const current = currentTimeInTz(wh.timezone, now)
  return current >= wh.start && current <= wh.end
}

// Возвращает Date следующего «можно слать» момента.
// Если сейчас рабочее время — возвращает now.
// Если до начала — сегодня в start.
// Если после конца — завтра в start.
export function getNextWorkingTime(
  vacancy: Parameters<typeof resolveWorkingHours>[0],
  now: Date = new Date(),
): Date {
  const wh = resolveWorkingHours(vacancy)
  if (!wh.enabled) return now

  const current = currentTimeInTz(wh.timezone, now)
  if (current >= wh.start && current <= wh.end) return now

  const [sh, sm] = wh.start.split(":").map((n) => Number.parseInt(n, 10))
  // Базовое решение без полной DST-арифметики: считаем границы в локальной TZ
  // вакансии, конвертируем обратно в UTC через сам Date объект.
  // Если current < start — целевая дата = сегодня в start; иначе завтра в start.
  const targetDay = new Date(now)
  if (current > wh.end) {
    targetDay.setUTCDate(targetDay.getUTCDate() + 1)
  }

  // Эмулируем перевод в TZ: получаем компоненты YYYY-MM-DD в TZ,
  // потом строим ISO и конвертируем обратно.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: wh.timezone,
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  })
  const parts = fmt.formatToParts(targetDay)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  if (!y || !m || !d) return now

  // Локальное время вакансии {y}-{m}-{d} {sh}:{sm}.
  // Чтобы получить корректный UTC, используем Date с указанием TZ через
  // временный костыль: создаём UTC-Date, потом сдвигаем на (TZ-offset).
  const tentative = new Date(`${y}-${m}-${d}T${pad(sh)}:${pad(sm)}:00Z`)
  // Текущее смещение TZ относительно UTC в минутах в этой дате.
  const tzOffsetMin = getTzOffsetMin(wh.timezone, tentative)
  return new Date(tentative.getTime() - tzOffsetMin * 60_000)
}

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

// Смещение часового пояса относительно UTC в минутах (для данной даты).
function getTzOffsetMin(timezone: string, ref: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  })
  const parts = fmt.formatToParts(ref)
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0"
  const m = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return 0
  const sign = m[1] === "+" ? 1 : -1
  const h = Number.parseInt(m[2], 10)
  const min = m[3] ? Number.parseInt(m[3], 10) : 0
  return sign * (h * 60 + min)
}
