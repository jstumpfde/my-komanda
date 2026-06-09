// Серверная логика загрузки данных для /schedule/[token].
// Вызывается из серверного компонента page.tsx напрямую (без HTTP round-trip).

import { eq, and, gte, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents } from "@/lib/db/schema"
import { isShortId } from "@/lib/short-id"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { SchedulePageData, MethodConfig, SlotDay } from "@/lib/schedule-interview-types"

export type { SchedulePageData, MethodConfig, SlotDay }

// ─── Константы / дефолты ──────────────────────────────────────────────────────

const DEFAULT_DAYS   = ["mon","tue","wed","thu","fri"]
const DEFAULT_FROM   = "09:00"
const DEFAULT_TO     = "18:00"
const DEFAULT_STEP   = 30
const DEFAULT_MAX    = 8
const DAY_ID_TO_JS   = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 } as const
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`
}

function formatDayLabel(date: Date): string {
  const wd  = DAY_LABELS_RU[date.getDay()] ?? ""
  const mon = MONTH_SHORT_RU[date.getMonth()] ?? ""
  return `${wd}, ${date.getDate()} ${mon}`
}

function dateToYMD(d: Date): string {
  return d.toISOString().slice(0,10)
}

function generateDaySlots(cfg: {
  from: number
  to: number
  step: number
  lunchEnabled: boolean
  lunchFrom: number
  lunchTo: number
  duration: number
}): string[] {
  const slots: string[] = []
  let cur = cfg.from
  while (cur + cfg.duration <= cfg.to) {
    const slotEnd = cur + cfg.duration
    if (cfg.lunchEnabled) {
      const overlapsLunch = cur < cfg.lunchTo && slotEnd > cfg.lunchFrom
      if (!overlapsLunch) slots.push(minutesToTime(cur))
    } else {
      slots.push(minutesToTime(cur))
    }
    cur += cfg.step
  }
  return slots
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
        vacancyTitle:     vacancies.title,
        companyId:        vacancies.companyId,
        companyName:      companies.name,
        companyBrandName: companies.brandName,
        companyLogo:      companies.logoUrl,
        brandPrimary:     companies.brandPrimaryColor,
        brandBg:          companies.brandBgColor,
        hiringDefaults:   companies.hiringDefaultsJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    if (!row) return { data: null, error: "Вакансия не найдена" }

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    const enabledDays   = sched.interviewDays?.length ? sched.interviewDays : DEFAULT_DAYS
    const enabledJsDays = new Set(
      enabledDays.map(d => DAY_ID_TO_JS[d as keyof typeof DAY_ID_TO_JS] ?? -1)
    )
    const fromMins  = timeToMinutes(sched.interviewFrom ?? DEFAULT_FROM)
    const toMins    = timeToMinutes(sched.interviewTo   ?? DEFAULT_TO)
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? "Europe/Moscow"

    const lunchEnabled = sched.lunchEnabled ?? false
    const lunchFrom = lunchEnabled ? timeToMinutes(sched.lunchFrom ?? "13:00") : 0
    const lunchTo   = lunchEnabled ? timeToMinutes(sched.lunchTo   ?? "14:00") : 0

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

    // 5. Занятые слоты компании на 14 дней
    const now   = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + 14)

    const bookedEvents = await db
      .select({ startAt: calendarEvents.startAt })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId, row.companyId),
        eq(calendarEvents.type, "interview"),
        gte(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, limit),
      ))

    type BookedByDay = Record<string, number>
    const bookedCountByDay: BookedByDay = {}
    const bookedSlotSet = new Set<string>()

    for (const evt of bookedEvents) {
      const d = dateToYMD(evt.startAt)
      bookedCountByDay[d] = (bookedCountByDay[d] ?? 0) + 1
      const hhmm = evt.startAt.toISOString().slice(11, 16)
      bookedSlotSet.add(`${d}T${hhmm}`)
    }

    // 6. Генерируем слоты на 14 дней вперёд
    const days: SlotDay[] = []
    const checkDate = new Date(now)
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)

    for (let i = 0; i < 21 && days.length < 14; i++) {
      const jsDay = checkDate.getDay()
      if (enabledJsDays.has(jsDay)) {
        const ymd = dateToYMD(checkDate)
        const dayBooked = bookedCountByDay[ymd] ?? 0

        if (dayBooked < maxPerDay) {
          const rawSlots = generateDaySlots({
            from: fromMins, to: toMins, step, lunchEnabled, lunchFrom, lunchTo,
            duration: defaultDuration,
          })
          const freeSlots = rawSlots.filter(t => !bookedSlotSet.has(`${ymd}T${t}`))
          const remaining = maxPerDay - dayBooked
          const available = freeSlots.slice(0, remaining)

          if (available.length > 0) {
            days.push({ date: ymd, label: formatDayLabel(checkDate), slots: available })
          }
        }
      }
      checkDate.setDate(checkDate.getDate() + 1)
    }

    // 7. Имя кандидата
    const nameParts = (candidate.name ?? "").trim().split(/\s+/)
    // Российский порядок: Фамилия Имя Отчество — берём индекс 1 (Имя)
    const firstName = nameParts[1] ?? nameParts[0] ?? ""

    const data: SchedulePageData = {
      candidateName:      candidate.name ?? "",
      candidateFirstName: firstName,
      vacancyTitle:       row.vacancyTitle,
      companyName:        row.companyBrandName ?? row.companyName,
      companyLogo:        row.companyLogo,
      brandPrimaryColor:  row.brandPrimary ?? "#3b82f6",
      brandBgColor:       row.brandBg      ?? "#f0f4ff",
      timezone,
      officeAddress:      sched.officeAddress ?? null,
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
