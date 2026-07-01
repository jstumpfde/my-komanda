// Серверная логика загрузки данных для /schedule/[token].
// Вызывается из серверного компонента page.tsx напрямую (без HTTP round-trip).

import { eq, and, gte, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents } from "@/lib/db/schema"
import { isShortId } from "@/lib/short-id"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { SchedulePageData, MethodConfig, SlotDay } from "@/lib/schedule-interview-types"
import { resolveDaySchedule, resolveVacancyDaySchedule, generateSlotsForWindows, JS_TO_DAY_ID } from "@/lib/schedule/day-windows"
import { normalizeFunnelV2, type InterviewMode } from "@/lib/funnel-v2/types"

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

// Подпись часового пояса для кандидата (он пояс НЕ меняет — только читает).
const TZ_LABELS: Record<string, string> = {
  "Europe/Kaliningrad": "Калининград (UTC+2)",
  "Europe/Moscow":      "Москва (UTC+3)",
  "Europe/Samara":      "Самара (UTC+4)",
  "Asia/Yekaterinburg": "Екатеринбург (UTC+5)",
  "Asia/Omsk":          "Омск (UTC+6)",
  "Asia/Novosibirsk":   "Новосибирск (UTC+7)",
  "Asia/Irkutsk":       "Иркутск (UTC+8)",
  "Asia/Yakutsk":       "Якутск (UTC+9)",
  "Asia/Vladivostok":   "Владивосток (UTC+10)",
  "Asia/Magadan":       "Магадан (UTC+11)",
  "Asia/Kamchatka":     "Камчатка (UTC+12)",
}

function timezoneLabelFor(tz: string): string {
  return TZ_LABELS[tz] ?? tz
}

// Читает interviewMode из первой interview-стадии воронки v2 вакансии.
// Возвращает null, если воронка v2 выключена или интервью-стадии нет —
// тогда способ встречи определяется настройками расписания компании.
function interviewModeFromFunnelV2(descriptionJson: unknown): InterviewMode | null {
  const raw = (descriptionJson as { funnelV2?: unknown } | null)?.funnelV2
  if (!raw) return null
  const cfg = normalizeFunnelV2(raw)
  if (!cfg.enabled) return null
  const interviewStage = cfg.stages.find(s => s.action === "interview" && s.interviewMode)
  return interviewStage?.interviewMode ?? null
}

// Сводит абстрактный interviewMode воронки (phone|zoom|office) к конкретному
// способу встречи из включённых методов расписания. Для "zoom" (видео) выбираем
// первый включённый видео-метод (telemost→zoom→meet), чтобы адрес/ссылку показать верно.
function pickMethodForMode(mode: InterviewMode, enabled: MethodConfig[]): MethodConfig | null {
  if (mode === "phone")  return enabled.find(m => m.method === "phone")  ?? null
  if (mode === "office") return enabled.find(m => m.method === "office") ?? null
  // mode === "zoom" → любой видео-метод
  const videoOrder = ["telemost", "zoom", "meet"]
  for (const v of videoOrder) {
    const found = enabled.find(m => m.method === v)
    if (found) return found
  }
  return null
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
        // #21: per-вакансия окна записи (descriptionJson.interviewDaySchedule)
        vacancyDescriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    if (!row) return { data: null, error: "Вакансия не найдена" }

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    // Окна доступности по дням недели (новый источник правды; legacy деривится).
    const daySchedule = resolveVacancyDaySchedule(
      (row.vacancyDescriptionJson as { interviewDaySchedule?: unknown } | null)?.interviewDaySchedule,
      sched,
    )
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? DEFAULT_TZ

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

    let enabledMethods = methods.filter(m => m.enabled)

    // #26.3: способ встречи кандидат НЕ выбирает — показываем ТОЛЬКО актуальный.
    // Источник правды в порядке приоритета:
    //   1) interviewMode интервью-стадии воронки v2 вакансии;
    //   2) sched.defaultInterviewMethod (настройки расписания компании);
    //   3) первый включённый метод (предпочтительно telemost).
    const funnelMode = interviewModeFromFunnelV2(row.vacancyDescriptionJson)
    let pinned: MethodConfig | null = null
    if (funnelMode) {
      pinned = pickMethodForMode(funnelMode, enabledMethods)
    }
    if (!pinned && sched.defaultInterviewMethod) {
      pinned = enabledMethods.find(m => m.method === sched.defaultInterviewMethod) ?? null
    }
    if (!pinned) {
      pinned =
        enabledMethods.find(m => m.method === "telemost")
        ?? enabledMethods[0]
        ?? null
    }

    // Оставляем ровно один способ — карточек выбора не показываем.
    if (pinned) enabledMethods = [pinned]

    const defaultMethod  = pinned?.method ?? "phone"
    const defaultDuration = pinned?.duration ?? 60

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
      const jsDay = localDayOfWeek(checkDate, timezone)
      const windows = daySchedule[JS_TO_DAY_ID[jsDay]] ?? []
      if (windows.length > 0) {
        const ymd = localDateToYMD(checkDate, timezone)
        const dayBooked = bookedCountByDay[ymd] ?? 0

        if (dayBooked < maxPerDay) {
          const rawSlots = generateSlotsForWindows(windows, step, defaultDuration)
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
      timezoneLabel:      timezoneLabelFor(timezone),
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
