// GET /api/public/schedule/[token]  — данные для страницы /schedule/[token]
// POST /api/public/schedule/[token] — бронирование интервью кандидатом
// Публичный роут (без сессии), токен = candidates.token.

import { NextRequest } from "next/server"
import { eq, and, gte, lte, gt, lt, ne, sql, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents, users, integrators, integratorClients } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { SchedulePageData, MethodConfig, SlotDay } from "@/lib/schedule-interview-types"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
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
  { method:"phone",   label:"Телефон",        enabled:true,  duration:30, buffer:10 },
  { method:"zoom",    label:"Zoom",           enabled:false, duration:60, buffer:10 },
  { method:"telemost",label:"Яндекс Телемост",enabled:true,  duration:60, buffer:10 },
  { method:"meet",    label:"Google Meet",    enabled:false, duration:60, buffer:10 },
  { method:"office",  label:"Офис",           enabled:true,  duration:60, buffer:15 },
]

const METHOD_LABELS: Record<string, string> = {
  phone:"Телефон", zoom:"Zoom", telemost:"Яндекс Телемост", meet:"Google Meet", office:"Офис"
}

// #26.4: платформенный дефолт текстов экрана "Вы записаны" — переопределяется
// per-вакансия через descriptionJson.interviewBookedScreen {title, text}.
// {{дата, время}} подставляется из подтверждённого слота.
const DEFAULT_BOOKED_TITLE = "Вы записаны на интервью!"
const DEFAULT_BOOKED_TEXT  = "Ждём вас {{дата, время}}. Мы напомним вам накануне и за 2 часа до встречи. Если планы изменятся — просто выберите другое время по этой же ссылке."

function buildBookedScreenTexts(
  descriptionJson: unknown,
  dateTimeLabel: string,
): { bookedTitle: string; bookedText: string } {
  const custom = (descriptionJson as { interviewBookedScreen?: { title?: unknown; text?: unknown } } | null)?.interviewBookedScreen
  const titleTpl = (typeof custom?.title === "string" && custom.title.trim()) ? custom.title : DEFAULT_BOOKED_TITLE
  const textTpl  = (typeof custom?.text  === "string" && custom.text.trim())  ? custom.text  : DEFAULT_BOOKED_TEXT
  const substitute = (s: string) => s.replaceAll("{{дата, время}}", dateTimeLabel)
  return { bookedTitle: substitute(titleTpl), bookedText: substitute(textTpl) }
}

// Подпись часового пояса для кандидата (пояс он не меняет — только читает).
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

// interviewMode из первой interview-стадии воронки v2 (или null).
function interviewModeFromFunnelV2(descriptionJson: unknown): InterviewMode | null {
  const raw = (descriptionJson as { funnelV2?: unknown } | null)?.funnelV2
  if (!raw) return null
  const cfg = normalizeFunnelV2(raw)
  if (!cfg.enabled) return null
  const st = cfg.stages.find(s => s.action === "interview" && s.interviewMode)
  return st?.interviewMode ?? null
}

// Сводит interviewMode (phone|zoom|office) к конкретному включённому методу.
function pickMethodForMode(mode: InterviewMode, enabled: MethodConfig[]): MethodConfig | null {
  if (mode === "phone")  return enabled.find(m => m.method === "phone")  ?? null
  if (mode === "office") return enabled.find(m => m.method === "office") ?? null
  for (const v of ["telemost", "zoom", "meet"]) {
    const found = enabled.find(m => m.method === v)
    if (found) return found
  }
  return null
}

// ─── TZ-хелперы (Intl, без сторонних пакетов) ────────────────────────────────

/**
 * Возвращает локальные части даты (год, месяц, день, часы, минуты, секунды)
 * в заданной таймзоне. Использует Intl.DateTimeFormat — нет зависимостей.
 */
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
    month:  get("month"),   // 1-based
    day:    get("day"),
    hour:   get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

/**
 * YYYY-MM-DD в локальной таймзоне (без конвертации через UTC-midnight-gotcha).
 */
function localDateToYMD(utcDate: Date, tz: string): string {
  const { year, month, day } = getLocalParts(utcDate, tz)
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
}

/**
 * JS-день недели (0=Вс) в локальной таймзоне.
 */
function localDayOfWeek(utcDate: Date, tz: string): number {
  // Intl не отдаёт weekday напрямую как число — получаем через Date
  // пересобранный в локальное полночь UTC.
  const { year, month, day } = getLocalParts(utcDate, tz)
  return new Date(Date.UTC(year, month - 1, day)).getDay()
}

/**
 * Лейбл дня ("Пн, 9 июн") на основе локальных частей даты.
 */
function formatDayLabelTz(utcDate: Date, tz: string): string {
  const { month, day } = getLocalParts(utcDate, tz)
  const jsDay = localDayOfWeek(utcDate, tz)
  const wd  = DAY_LABELS_RU[jsDay] ?? ""
  const mon = MONTH_SHORT_RU[month - 1] ?? ""
  return `${wd}, ${day} ${mon}`
}

/**
 * Создаёт UTC-Date, соответствующий локальному YYYY-MM-DD HH:MM:00 в заданной TZ.
 * Используется для записи startAt / endAt в БД и для сравнения с занятыми слотами.
 */
function localDateTimeToUtc(ymd: string, hhmm: string, tz: string): Date {
  // Способ: создаём строку "YYYY-MM-DDTHH:MM:00" и интерпретируем в TZ через Intl.
  // Для надёжности используем бинарный поиск оффсета (обходит DST-неоднозначность).
  const [year, month, day]   = ymd.split("-").map(Number)
  const [hour, minute]       = hhmm.split(":").map(Number)
  // Стартовая точка: предполагаем UTC, потом корректируем.
  const guess = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, 0))
  // Получаем локальные части этой UTC-точки и считаем сдвиг.
  const local = getLocalParts(guess, tz)
  const diffMin =
    (local.hour - hour!) * 60 + (local.minute - minute!) +
    ((local.day !== day! || local.month !== month! || local.year !== year!) ?
      (local.year > year! || (local.year === year! && local.month > month!) ||
       (local.year === year! && local.month === month! && local.day > day!) ? 1440 : -1440)
      : 0)
  return new Date(guess.getTime() - diffMin * 60_000)
}

/**
 * Возвращает "YYYY-MM-DD" и "HH:MM" локальные значения UTC-даты в TZ.
 */
function utcToLocalDateTime(utcDate: Date, tz: string): { ymd: string; hhmm: string } {
  const { year, month, day, hour, minute } = getLocalParts(utcDate, tz)
  const ymd  = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
  const hhmm = `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`
  return { ymd, hhmm }
}

// ─── GET /api/public/schedule/[token] ────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "schedule-get")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params

    // 1. Резолвим кандидата по token (или short_id)
    const [candidate] = await db
      .select({
        id:            candidates.id,
        name:          candidates.name,
        vacancyId:     candidates.vacancyId,
        interviewMode: candidates.interviewMode,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (!candidate) return apiError("Кандидат не найден", 404)

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
      .where(and(eq(vacancies.id, candidate.vacancyId), isNull(vacancies.deletedAt)))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    // Окна доступности по дням недели: сначала per-вакансия, иначе company-level.
    const daySchedule = resolveVacancyDaySchedule(
      (row.vacancyDescriptionJson as { interviewDaySchedule?: unknown } | null)?.interviewDaySchedule,
      sched,
    )
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? "Europe/Moscow"

    // 4. Методы интервью
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
      // legacy: список включённых методов без конфига
      methods = DEFAULT_METHODS.map(m => ({
        ...m,
        enabled: (sched.interviewMethods as string[]).includes(m.method),
      }))
    } else {
      methods = DEFAULT_METHODS
    }

    let enabledMethods = methods.filter(m => m.enabled)

    // #26.3: кандидат способ НЕ выбирает — оставляем ровно один актуальный.
    // Приоритет: выбор HR для кандидата (candidates.interview_mode, Юрий 03.07)
    // → interviewMode воронки v2 → sched.defaultInterviewMethod → telemost/первый.
    const candMode = (candidate.interviewMode === "phone" || candidate.interviewMode === "zoom" || candidate.interviewMode === "office")
      ? candidate.interviewMode : null
    const funnelMode = candMode ?? interviewModeFromFunnelV2(row.vacancyDescriptionJson)
    let pinned: MethodConfig | null = null
    if (funnelMode) pinned = pickMethodForMode(funnelMode, enabledMethods)
    if (!pinned && sched.defaultInterviewMethod) {
      pinned = enabledMethods.find(m => m.method === sched.defaultInterviewMethod) ?? null
    }
    if (!pinned) {
      pinned = enabledMethods.find(m => m.method === "telemost") ?? enabledMethods[0] ?? null
    }
    if (pinned) enabledMethods = [pinned]

    // Платформа (Телемост/Zoom/Meet) — только если способы настроены явно;
    // дефолтный набор не должен подставлять «Яндекс Телемост» (Юрий 03.07).
    const methodsConfigured =
      (Array.isArray(sched.interviewMethodConfigs) && sched.interviewMethodConfigs.length > 0) ||
      (Array.isArray(sched.interviewMethods) && sched.interviewMethods.length > 0)
    if (!methodsConfigured) {
      enabledMethods = enabledMethods.map(m => ({ ...m, label: "" }))
    }

    const defaultMethod  = pinned?.method ?? "phone"

    // Для слотов используем длительность выбранного метода
    const defaultDuration = pinned?.duration ?? 60

    // 5. Уже занятые слоты этой компании (type='interview', ближайшие 16 дней)
    // Берём UTC-границы с запасом (+16 д), чтобы не срезать последний день в
    // любой TZ (максимальный оффсет UTC+14).
    // Горизонт самозаписи (настройка вакансии interviewMaxBookingDays →
    // company schedule.maxBookingDays → 14; потолок 30) — кандидат видит
    // слоты максимум на столько календарных дней вперёд.
    const djHorizon = (row.vacancyDescriptionJson as { interviewMaxBookingDays?: unknown } | null)?.interviewMaxBookingDays
    const rawHorizon = Number(djHorizon ?? (sched as { maxBookingDays?: unknown }).maxBookingDays ?? 14)
    const horizonDays = Number.isFinite(rawHorizon) && rawHorizon >= 1 ? Math.min(30, Math.floor(rawHorizon)) : 14

    const now   = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + horizonDays + 2)

    const bookedEvents = await db
      .select({
        startAt: calendarEvents.startAt,
        endAt:   calendarEvents.endAt,
      })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId, row.companyId),
        eq(calendarEvents.type, "interview"),
        gte(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, limit),
      ))

    // Занятые слоты: ключ "YYYY-MM-DD T HH:MM" в локальной TZ компании.
    type BookedByDay = Record<string, number>
    const bookedCountByDay: BookedByDay = {}
    const bookedSlotSet   = new Set<string>()

    for (const evt of bookedEvents) {
      const { ymd, hhmm } = utcToLocalDateTime(evt.startAt, timezone)
      bookedCountByDay[ymd] = (bookedCountByDay[ymd] ?? 0) + 1
      bookedSlotSet.add(`${ymd}T${hhmm}`)
    }

    // 6. Генерируем слоты на 14 рабочих дней в TZ компании.
    // checkDate продвигаем как UTC-midnight-эквивалент локального дня:
    // каждый шаг — +24ч (DST-безопасно для серверных расчётов),
    // день недели и лейбл определяем через localDayOfWeek/formatDayLabelTz.
    const days: SlotDay[] = []
    // «Завтра» в TZ компании: начинаем с now + 24h и определяем локальный день.
    const checkDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    for (let i = 0; i < horizonDays; i++) {
      const jsDay = localDayOfWeek(checkDate, timezone)
      const windows = daySchedule[JS_TO_DAY_ID[jsDay]] ?? []
      if (windows.length > 0) {
        const ymd = localDateToYMD(checkDate, timezone)
        const dayBooked = bookedCountByDay[ymd] ?? 0

        if (dayBooked < maxPerDay) {
          const rawSlots = generateSlotsForWindows(windows, step, defaultDuration)

          // Исключаем уже занятые конкретные слоты (ключи в локальной TZ)
          const freeSlots = rawSlots.filter(t => !bookedSlotSet.has(`${ymd}T${t}`))

          // Применяем maxPerDay как лимит на свободные слоты в этот день
          const remaining = maxPerDay - dayBooked
          const available = freeSlots.slice(0, remaining)

          if (available.length > 0) {
            days.push({
              date:  ymd,
              label: formatDayLabelTz(checkDate, timezone),
              slots: available,
            })
          }
        }
      }
      checkDate.setTime(checkDate.getTime() + 24 * 60 * 60 * 1000)
    }

    // 7. Собираем ответ
    const firstName = (candidate.name ?? "").split(" ")[1] ?? (candidate.name ?? "").split(" ")[0] ?? ""

    // #3.4 Fallback адреса: сначала из настроек расписания, потом из профиля компании.
    const officeAddress = sched.officeAddress ?? row.companyOfficeAddress ?? null

    const data: SchedulePageData = {
      candidateName:     candidate.name ?? "",
      candidateFirstName: firstName,
      vacancyTitle:      row.vacancyTitle,
      companyName:       row.companyBrandName ?? row.companyName,
      companyLogo:       row.companyLogo,
      brandPrimaryColor: row.brandPrimary ?? "#3b82f6",
      brandBgColor:      row.brandBg      ?? "#f0f4ff",
      timezone,
      timezoneLabel:     TZ_LABELS[timezone] ?? timezone,
      officeAddress,
      methods:           enabledMethods,
      defaultMethod,
      days,
    }

    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule GET]", err)
    return apiError("Ошибка сервера", 500)
  }
}

// ─── POST /api/public/schedule/[token] — бронирование слота ─────────────────

interface BookingBody {
  date:   string  // "YYYY-MM-DD"
  time:   string  // "HH:MM"
  method: string  // "phone"|"zoom"|"telemost"|"meet"|"office"
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id: не даём массово бронировать/переносить
    // интервью за чужих кандидатов (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "schedule-post")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params
    const body = await req.json().catch(() => ({})) as Partial<BookingBody>

    if (!body.date || !body.time || !body.method) {
      return apiError("Обязательные поля: date, time, method", 400)
    }

    // Проверяем формат
    const dateRx = /^\d{4}-\d{2}-\d{2}$/
    const timeRx = /^([01]\d|2[0-3]):[0-5]\d$/
    if (!dateRx.test(body.date) || !timeRx.test(body.time)) {
      return apiError("Неверный формат date или time", 400)
    }

    // 1. Резолвим кандидата
    const [candidate] = await db
      .select({
        id:        candidates.id,
        name:      candidates.name,
        vacancyId: candidates.vacancyId,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (!candidate) return apiError("Кандидат не найден", 404)

    // 2. Вакансия + компания + первый user компании (для createdBy)
    const [row] = await db
      .select({
        vacancyTitle:         vacancies.title,
        vacancyId:            vacancies.id,
        companyId:            vacancies.companyId,
        hiringDefaults:       companies.hiringDefaultsJson,
        calendarDefaultUserId: companies.calendarDefaultUserId,
        // #3.4 Fallback адреса из профиля компании
        companyOfficeAddress: companies.officeAddress,
        // #26.4: настраиваемые тексты экрана "Вы записаны" (descriptionJson.interviewBookedScreen)
        vacancyDescriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(and(eq(vacancies.id, candidate.vacancyId), isNull(vacancies.deletedAt)))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    // Получаем пользователя для createdBy. Приоритет:
    //   1. Явный выбор администратора (companies.calendarDefaultUserId,
    //      /admin/clients → «Ответственный за календарь» — Юрий 09.07).
    //   2. Первый живой пользователь самой компании.
    //   3. Партнёрские клиенты (Revoluterra): компания ведётся ТОЛЬКО через
    //      имперсонацию управляющего партнёра, своих users нет вообще —
    //      фолбэк на первого пользователя партнёра из integrator_clients.
    let companyUser: { id: string } | undefined
    if (row.calendarDefaultUserId) {
      const [explicit] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, row.calendarDefaultUserId), isNull(users.deletedAt)))
        .limit(1)
      companyUser = explicit
    }

    if (!companyUser) {
      const [ownUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.companyId, row.companyId),
          isNull(users.deletedAt),
        ))
        .limit(1)
      companyUser = ownUser
    }

    if (!companyUser) {
      const [partnerUser] = await db
        .select({ id: users.id })
        .from(integratorClients)
        .innerJoin(integrators, eq(integrators.id, integratorClients.integratorId))
        .innerJoin(users, and(eq(users.companyId, integrators.companyId), isNull(users.deletedAt)))
        .where(eq(integratorClients.clientCompanyId, row.companyId))
        .limit(1)
      companyUser = partnerUser
    }

    if (!companyUser) return apiError("Компания не настроена", 404)

    // 3. Разбираем настройки расписания
    const sched   = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}
    const timezone = sched.timezone ?? DEFAULT_TZ

    // Длительность метода
    let duration = 60
    if (sched.interviewMethodConfigs) {
      const mc = sched.interviewMethodConfigs.find(c => c.method === body.method)
      if (mc) duration = mc.duration
    }

    // 4. Строим startAt / endAt.
    // body.date + body.time — локальное время в TZ компании; конвертируем в UTC.
    const startAt = localDateTimeToUtc(body.date, body.time, timezone)
    const endAt   = new Date(startAt.getTime() + duration * 60_000)

    // 5. Идемпотентность по этому же слоту (candidate + startAt).
    const [existingSlot] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId,   row.companyId),
        eq(calendarEvents.candidateId, candidate.id),
        eq(calendarEvents.type,        "interview"),
        eq(calendarEvents.startAt,     startAt),
      ))
      .limit(1)

    if (existingSlot) {
      const methodLabelExisting = METHOD_LABELS[body.method] ?? body.method
      const localStartExisting  = utcToLocalDateTime(startAt, timezone)
      const tzLabelExisting     = timezone === "Europe/Moscow" ? "МСК" : timezone
      const dateTimeLabelExisting = `${formatDayLabelTz(startAt, timezone)} в ${localStartExisting.hhmm} (${tzLabelExisting})`
      const { bookedTitle, bookedText } = buildBookedScreenTexts(row.vacancyDescriptionJson, dateTimeLabelExisting)
      const locationExisting = body.method === "office"
        ? (sched.officeAddress ?? row.companyOfficeAddress ?? null)
        : null

      return apiSuccess({
        alreadyBooked: true,
        eventId: existingSlot.id,
        bookedTitle,
        bookedText,
        startAt: startAt.toISOString(),
        endAt:   endAt.toISOString(),
        timezone,
        methodLabel: methodLabelExisting,
        location: locationExisting,
        vacancyTitle: row.vacancyTitle,
      })
    }

    // 5.5 Анти-двойная-запись (company-wide, все вакансии): слот не должен
    // пересекаться с ЧУЖИМ подтверждённым интервью этой компании. Закрывает
    // гонку двух кандидатов на один слот. Свои события исключаем (их перенос —
    // ниже). Пересечение: existing.startAt < endAt И existing.endAt > startAt.
    const [slotTaken] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId,   row.companyId),
        eq(calendarEvents.type,        "interview"),
        eq(calendarEvents.status,      "confirmed"),
        ne(calendarEvents.candidateId, candidate.id),
        lt(calendarEvents.startAt,     endAt),
        gt(calendarEvents.endAt,       startAt),
      ))
      .limit(1)
    if (slotTaken) {
      return apiError("Это время уже занято — выберите, пожалуйста, другой слот.", 409)
    }

    // #3.3 Перенос: если у кандидата уже есть будущий interview-event — отменяем его.
    // Идемпотентно: не трогаем прошедшие события и только что созданный (выше проверено).
    // Юрий 10.07: interviewStatus (текстовый бейдж в списке интервью) обязательно
    // синхронизируем с status — иначе список HR показывал ДВЕ «Подтверждено»
    // карточки на одного кандидата (реально отменённая + новая), хотя защита от
    // двойной записи на уровне БД уже отрабатывала верно (баг был только в отображении).
    const nowForCancel = new Date()
    await db
      .update(calendarEvents)
      .set({ status: "cancelled", interviewStatus: "Отменено" })
      .where(and(
        eq(calendarEvents.companyId,   row.companyId),
        eq(calendarEvents.candidateId, candidate.id),
        eq(calendarEvents.type,        "interview"),
        eq(calendarEvents.status,      "confirmed"),
        gt(calendarEvents.startAt,     nowForCancel),
      ))

    // 6. Создаём новое событие
    const methodLabel    = METHOD_LABELS[body.method] ?? body.method
    const interviewFormat = body.method === "office" ? "Офис" : "Онлайн"

    // #3.4 Fallback адреса: сначала из настроек расписания, потом из профиля компании.
    // Для онлайн-методов адрес не нужен (там нужна ссылка на конфу, которую HR ставит вручную).
    const location = body.method === "office"
      ? (sched.officeAddress ?? row.companyOfficeAddress ?? null)
      : null

    const [event] = await db
      .insert(calendarEvents)
      .values({
        companyId:       row.companyId,
        title:           `Интервью — ${candidate.name ?? "Кандидат"}`,
        description:     `Кандидат записался самостоятельно через страницу выбора времени. Способ: ${methodLabel}.`,
        type:            "interview",
        startAt,
        endAt,
        createdBy:       companyUser.id,
        status:          "confirmed",
        candidateId:     candidate.id,
        vacancyId:       candidate.vacancyId,
        interviewFormat,
        interviewStatus: "Подтверждено",
        location,
        meetingUrl:      null,
        scope:           "company",
      })
      .returning({ id: calendarEvents.id })

    // 7. Переводим кандидата в стадию scheduled (только если ещё не дальше по воронке)
    await db
      .update(candidates)
      .set({ stage: "scheduled", updatedAt: new Date() })
      .where(and(
        eq(candidates.id, candidate.id),
        sql`${candidates.stage} NOT IN ('scheduled','interview','interviewed','final_decision','offer','hired','rejected')`,
      ))

    // 8. #3.2 Уведомление HR в Telegram при брони
    const localStart = utcToLocalDateTime(startAt, timezone)
    const tzLabel    = timezone === "Europe/Moscow" ? "МСК" : timezone
    void sendToCompanyChannel(
      row.companyId,
      `📅 <b>Новая запись на интервью</b>\n` +
      `👤 Кандидат: ${candidate.name ?? "—"}\n` +
      `💼 Вакансия: ${row.vacancyTitle}\n` +
      `🕐 Дата и время: ${localStart.ymd} ${localStart.hhmm} (${tzLabel})\n` +
      `📍 Способ: ${methodLabel}` +
      (location ? `\n🏢 Адрес: ${location}` : ""),
    ).catch(() => {})

    // 9. #26.4 Настраиваемые тексты экрана "Вы записаны" (platform-дефолт в коде,
    // переопределяется per-вакансия через descriptionJson.interviewBookedScreen).
    const dayLabel = formatDayLabelTz(startAt, timezone)
    const dateTimeLabel = `${dayLabel} в ${localStart.hhmm} (${tzLabel})`
    const { bookedTitle, bookedText } = buildBookedScreenTexts(row.vacancyDescriptionJson, dateTimeLabel)

    return apiSuccess({
      booked:  true,
      eventId: event.id,
      bookedTitle,
      bookedText,
      startAt: startAt.toISOString(),
      endAt:   endAt.toISOString(),
      timezone,
      methodLabel,
      location,
      vacancyTitle: row.vacancyTitle,
    }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule POST]", err)
    return apiError("Ошибка сервера", 500)
  }
}

// DELETE /api/public/schedule/[token] — кандидат отменяет свою запись
// (Юрий 09.07: рядом с «Перенести на другое время» нужна отдельная «Отменить»,
// без выбора нового слота). Отменяет ближайшие confirmed interview-события
// кандидата — та же идемпотентная логика, что уже используется при переносе
// (POST выше, шаг «Перенос: если у кандидата уже есть будущий interview-event»).
// Стадию candidates.stage НЕ трогаем — она нигде не пишется в stage_history
// при простановке 'scheduled', надёжно восстановить «предыдущую» стадию
// неоткуда; источник истины об отмене — calendar_events.status.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!checkPublicTokenRateLimit(req, "schedule-delete")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params
    const [candidate] = await db
      .select({ id: candidates.id, name: candidates.name, vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (!candidate) return apiError("Кандидат не найден", 404)

    const [vac] = await db
      .select({ companyId: vacancies.companyId, vacancyTitle: vacancies.title })
      .from(vacancies)
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const now = new Date()
    const cancelled = await db
      .update(calendarEvents)
      .set({ status: "cancelled", interviewStatus: "Отменено" })
      .where(and(
        eq(calendarEvents.companyId,   vac.companyId),
        eq(calendarEvents.candidateId, candidate.id),
        eq(calendarEvents.type,        "interview"),
        eq(calendarEvents.status,      "confirmed"),
        gt(calendarEvents.startAt,     now),
      ))
      .returning({ id: calendarEvents.id })

    if (cancelled.length === 0) return apiError("Активная запись не найдена", 404)

    void sendToCompanyChannel(
      vac.companyId,
      `❌ <b>Кандидат отменил запись на интервью</b>\n` +
      `👤 Кандидат: ${candidate.name ?? "—"}\n` +
      `💼 Вакансия: ${vac.vacancyTitle}`,
    ).catch(() => {})

    return apiSuccess({ cancelled: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule DELETE]", err)
    return apiError("Ошибка сервера", 500)
  }
}
