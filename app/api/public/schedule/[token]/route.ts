// GET /api/public/schedule/[token]  — данные для страницы /schedule/[token]
// POST /api/public/schedule/[token] — бронирование интервью кандидатом
// Публичный роут (без сессии), токен = candidates.token.

import { NextRequest } from "next/server"
import { eq, and, gte, lte, gt, sql, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents, users } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { SchedulePageData, MethodConfig, SlotDay } from "@/lib/schedule-interview-types"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { resolveDaySchedule, rangesForJsDay } from "@/lib/schedule/day-windows"

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

// ─── Остальные helpers ────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`
}

// Генерирует слоты для одного дня по набору окон (мульти-диапазон).
// Обед выражен как разрыв между окнами, поэтому здесь отдельной логики обеда нет.
function generateDaySlots(cfg: {
  ranges: Array<{ from: number; to: number }>
  step: number
  duration: number  // продолжительность выбранного метода
}): string[] {
  const slots: string[] = []
  for (const range of cfg.ranges) {
    let cur = range.from
    while (cur + cfg.duration <= range.to) {
      slots.push(minutesToTime(cur))
      cur += cfg.step
    }
  }
  return Array.from(new Set(slots)).sort()
}

// ─── GET /api/public/schedule/[token] ────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // 1. Резолвим кандидата по token (или short_id)
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

    if (!row) return apiError("Вакансия не найдена", 404)

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? "Europe/Moscow"

    // #21 Окна записи по дням недели: per-вакансия либо company-level fallback.
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

    const enabledMethods = methods.filter(m => m.enabled)
    const defaultMethod  = sched.defaultInterviewMethod
      ?? (enabledMethods.find(m => m.method === "telemost")?.method
        ?? enabledMethods[0]?.method
        ?? "phone")

    // Для слотов используем длительность дефолтного метода
    const defaultDuration = enabledMethods.find(m => m.method === defaultMethod)?.duration
      ?? enabledMethods[0]?.duration
      ?? 60

    // 5. Уже занятые слоты этой компании (type='interview', ближайшие 16 дней)
    // Берём UTC-границы с запасом (+16 д), чтобы не срезать последний день в
    // любой TZ (максимальный оффсет UTC+14).
    const now   = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + 16)

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
        // #3.4 Fallback адреса из профиля компании
        companyOfficeAddress: companies.officeAddress,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    // Получаем первого директора/пользователя компании для createdBy
    const [companyUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.companyId, row.companyId),
        isNull(users.deletedAt),
      ))
      .limit(1)

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
      return apiSuccess({ alreadyBooked: true, eventId: existingSlot.id })
    }

    // #3.3 Перенос: если у кандидата уже есть будущий interview-event — отменяем его.
    // Идемпотентно: не трогаем прошедшие события и только что созданный (выше проверено).
    const nowForCancel = new Date()
    await db
      .update(calendarEvents)
      .set({ status: "cancelled" })
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

    return apiSuccess({ booked: true, eventId: event.id }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule POST]", err)
    return apiError("Ошибка сервера", 500)
  }
}
