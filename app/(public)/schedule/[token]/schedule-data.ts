// Серверная логика загрузки данных для /schedule/[token].
// Вызывается из серверного компонента page.tsx напрямую (без HTTP round-trip).

import { eq, and, gte, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents } from "@/lib/db/schema"
import { isShortId } from "@/lib/short-id"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { SchedulePageData, MethodConfig, SlotDay } from "@/lib/schedule-interview-types"
import { resolveDaySchedule, rangesForJsDay } from "@/lib/schedule/day-windows"

export type { SchedulePageData, MethodConfig, SlotDay }

// ─── Константы / дефолты ──────────────────────────────────────────────────────

const DEFAULT_TZ     = "Europe/Moscow"
const DEFAULT_STEP   = 30
const DEFAULT_MAX    = 8
const DAY_LABELS_RU  = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]
const MONTH_SHORT_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"]

const DEFAULT_METHODS: MethodConfig[] = [
  { method:"phone",    label:"Телефон",          enabled:true,  duration:30, buffer:10 },
  { method:"zoom",     label:"Zoom",             enabled:false, duration:60, buffer:10 },
  { method:"telemost", label:"Яндекс Телемост",  enabled:true,  duration:60, buffer:10 },
  { method:"meet",     label:"Google Meet",      enabled:false, duration:60, buffer:10 },
  { method:"office",   label:"Офис",             enabled:true,  duration:60, buffer:15 },
]

export const METHOD_LABELS: Record<string, string> = {
  phone:"Телефон", zoom:"Zoom", telemost:"Яндекс Телемост", meet:"Google Meet", office:"Офис"
}

// ─── TZ-хелперы (Intl, без сторонних пакетов) ────────────────────────────────

function getLocalParts(utcDate: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit",  minute: "2-digit", second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(utcDate)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10)
  return {
    year:   get("year"),
    month:  get("month"),
    day:    get("day"),
    hour:   get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

function localDateToYMD(utcDate: Date, tz: string): string {
  const { year, month, day } = getLocalParts(utcDate, tz)
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
}

function localDayOfWeek(utcDate: Date, tz: string): number {
  const { year, month, day } = getLocalParts(utcDate, tz)
  return new Date(Date.UTC(year, month - 1, day)).getDay()
}

function formatDayLabelTz(utcDate: Date, tz: string): string {
  const { month, day } = getLocalParts(utcDate, tz)
  const jsDay = localDayOfWeek(utcDate, tz)
  const wd  = DAY_LABELS_RU[jsDay] ?? ""
  const mon = MONTH_SHORT_RU[month - 1] ?? ""
  return `${wd}, ${day} ${mon}`
}

function utcToLocalDateTime(utcDate: Date, tz: string): { ymd: string; hhmm: string } {
  const { year, month, day, hour, minute } = getLocalParts(utcDate, tz)
  const ymd  = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
  const hhmm = `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`
  return { ymd, hhmm }
}

// ─── Остальные helpers ────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`
}

// Генерация слотов по набору окон (мульти-диапазон на день).
// Каждое окно [from,to] нарезается шагом step; слот входит, если целиком
// умещается в окно. Окна уже учитывают обед (обеденный интервал выражен как
// разрыв между двумя окнами).
function generateDaySlots(cfg: {
  ranges: Array<{ from: number; to: number }>
  step: number
  duration: number
}): string[] {
  const slots: string[] = []
  for (const range of cfg.ranges) {
    let cur = range.from
    while (cur + cfg.duration <= range.to) {
      slots.push(minutesToTime(cur))
      cur += cfg.step
    }
  }
  // Сортируем и дедупим (окна могут пересекаться при некорректном вводе).
  return Array.from(new Set(slots)).sort()
}

// ─── Основная функция ─────────────────────────────────────────────────────────

export async function fetchScheduleData(
  token: string
): Promise<{ data: SchedulePageData | null; error: string | null }> {
  try {
    // 1. Кандидат
    const [candidate] = await db
      .select({
        id:        candidates.id,
        name:      candidates.name,
        vacancyId: candidates.vacancyId,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (!candidate) return { data: null, error: "Ссылка недействительна или кандидат не найден" }

    // 2. Вакансия + компания
    const [row] = await db
      .select({
        vacancyTitle:         vacancies.title,
        companyId:            vacancies.companyId,
        companyName:          companies.name,
        companyBrandName:     companies.brandName,
        companyLogo:          companies.logoUrl,
        brandPrimary:         companies.brandPrimaryColor,
        brandBg:              companies.brandBgColor,
        hiringDefaults:       companies.hiringDefaultsJson,
        // #3.4 Fallback адреса: companies.office_address
        companyOfficeAddress: companies.officeAddress,
        // #21 per-вакансия окна записи (descriptionJson.interviewDaySchedule)
        vacancyDescriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    if (!row) return { data: null, error: "Вакансия не найдена" }

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? DEFAULT_TZ

    // #21 Окна записи по дням недели: per-вакансия (descriptionJson.interviewDaySchedule)
    // либо company-level fallback (из плоских interviewDays/From/To/lunch).
    const vacancyDj = (row.vacancyDescriptionJson && typeof row.vacancyDescriptionJson === "object")
      ? row.vacancyDescriptionJson as Record<string, unknown>
      : {}
    const daySchedule = resolveDaySchedule(vacancyDj.interviewDaySchedule, {
      interviewDays: sched.interviewDays,
      interviewFrom: sched.interviewFrom,
      interviewTo:   sched.interviewTo,
      lunchEnabled:  sched.lunchEnabled,
      lunchFrom:     sched.lunchFrom,
      lunchTo:       sched.lunchTo,
    })

    // 4. Методы
    let methods: MethodConfig[]
    if (sched.interviewMethodConfigs && sched.interviewMethodConfigs.length > 0) {
      methods = sched.interviewMethodConfigs.map(c => ({
        method:   c.method,
        label:    METHOD_LABELS[c.method] ?? c.method,
        enabled:  c.enabled,
        duration: c.duration,
        buffer:   c.buffer,
      }))
    } else if (sched.interviewMethods && sched.interviewMethods.length > 0) {
      methods = DEFAULT_METHODS.map(m => ({
        ...m,
        enabled: (sched.interviewMethods as string[]).includes(m.method),
      }))
    } else {
      methods = DEFAULT_METHODS
    }

    const enabledMethods = methods.filter(m => m.enabled)
    const defaultMethod  =
      sched.defaultInterviewMethod
      ?? enabledMethods.find(m => m.method === "telemost")?.method
      ?? enabledMethods[0]?.method
      ?? "phone"

    const defaultDuration =
      enabledMethods.find(m => m.method === defaultMethod)?.duration
      ?? enabledMethods[0]?.duration
      ?? 60

    // 5. Занятые слоты компании на 16 дней (с запасом на TZ-оффсет)
    const now   = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + 16)

    const bookedEvents = await db
      .select({ startAt: calendarEvents.startAt })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId, row.companyId),
        eq(calendarEvents.type, "interview"),
        gte(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, limit),
      ))

    // Ключи в локальной TZ компании — "YYYY-MM-DD T HH:MM"
    type BookedByDay = Record<string, number>
    const bookedCountByDay: BookedByDay = {}
    const bookedSlotSet = new Set<string>()

    for (const evt of bookedEvents) {
      const { ymd, hhmm } = utcToLocalDateTime(evt.startAt, timezone)
      bookedCountByDay[ymd] = (bookedCountByDay[ymd] ?? 0) + 1
      bookedSlotSet.add(`${ymd}T${hhmm}`)
    }

    // 6. Генерируем слоты на 14 рабочих дней в TZ компании
    const days: SlotDay[] = []
    // Начинаем с «завтра» в TZ компании
    const checkDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    for (let i = 0; i < 21 && days.length < 14; i++) {
      const jsDay  = localDayOfWeek(checkDate, timezone)
      const ranges = rangesForJsDay(daySchedule, jsDay)
      if (ranges.length > 0) {
        const ymd = localDateToYMD(checkDate, timezone)
        const dayBooked = bookedCountByDay[ymd] ?? 0

        if (dayBooked < maxPerDay) {
          const rawSlots = generateDaySlots({
            ranges: ranges.map(r => ({ from: timeToMinutes(r.from), to: timeToMinutes(r.to) })),
            step,
            duration: defaultDuration,
          })
          const freeSlots = rawSlots.filter(t => !bookedSlotSet.has(`${ymd}T${t}`))
          const remaining = maxPerDay - dayBooked
          const available = freeSlots.slice(0, remaining)

          if (available.length > 0) {
            days.push({ date: ymd, label: formatDayLabelTz(checkDate, timezone), slots: available })
          }
        }
      }
      checkDate.setTime(checkDate.getTime() + 24 * 60 * 60 * 1000)
    }

    // 7. Имя кандидата
    const nameParts = (candidate.name ?? "").trim().split(/\s+/)
    // Российский порядок: Фамилия Имя Отчество — берём индекс 1 (Имя)
    const firstName = nameParts[1] ?? nameParts[0] ?? ""

    // #3.4 Fallback адреса офиса
    const officeAddress = sched.officeAddress ?? row.companyOfficeAddress ?? null

    const data: SchedulePageData = {
      candidateName:      candidate.name ?? "",
      candidateFirstName: firstName,
      vacancyTitle:       row.vacancyTitle,
      companyName:        row.companyBrandName ?? row.companyName,
      companyLogo:        row.companyLogo,
      brandPrimaryColor:  row.brandPrimary ?? "#3b82f6",
      brandBgColor:       row.brandBg      ?? "#f0f4ff",
      timezone,
      officeAddress,
      methods:            enabledMethods,
      defaultMethod,
      days,
    }

    return { data, error: null }
  } catch (err) {
    console.error("[fetchScheduleData]", err)
    return { data: null, error: "Ошибка сервера" }
  }
}
