// GET /api/public/schedule/[token]  — данные для страницы /schedule/[token]
// POST /api/public/schedule/[token] — бронирование интервью кандидатом
// Публичный роут (без сессии), токен = candidates.token.

import { NextRequest } from "next/server"
import { eq, and, gte, lte, sql, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, calendarEvents, users } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
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
  { method:"phone",   label:"Телефон",       enabled:true,  duration:30, buffer:10 },
  { method:"zoom",    label:"Zoom",          enabled:false, duration:60, buffer:10 },
  { method:"telemost",label:"Яндекс Телемост",enabled:true, duration:60, buffer:10 },
  { method:"meet",    label:"Google Meet",   enabled:false, duration:60, buffer:10 },
  { method:"office",  label:"Офис",          enabled:true,  duration:60, buffer:15 },
]

const METHOD_LABELS: Record<string, string> = {
  phone:"Телефон", zoom:"Zoom", telemost:"Яндекс Телемост", meet:"Google Meet", office:"Офис"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`
}

function formatDayLabel(date: Date): string {
  const wd  = DAY_LABELS_RU[date.getDay()]
  const mon = MONTH_SHORT_RU[date.getMonth()]
  return `${wd}, ${date.getDate()} ${mon}`
}

function dateToYMD(d: Date): string {
  return d.toISOString().slice(0,10)
}

// Генерирует слоты для одного дня по настройкам
function generateDaySlots(cfg: {
  from: number
  to: number
  step: number
  lunchEnabled: boolean
  lunchFrom: number
  lunchTo: number
  duration: number  // продолжительность выбранного метода
}): string[] {
  const slots: string[] = []
  let cur = cfg.from
  while (cur + cfg.duration <= cfg.to) {
    const slotEnd = cur + cfg.duration
    // Пропускаем слоты, которые пересекаются с обедом
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
        vacancyTitle:      vacancies.title,
        companyId:         vacancies.companyId,
        companyName:       companies.name,
        companyBrandName:  companies.brandName,
        companyLogo:       companies.logoUrl,
        brandPrimary:      companies.brandPrimaryColor,
        brandBg:           companies.brandBgColor,
        hiringDefaults:    companies.hiringDefaultsJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}

    // 3. Разбираем настройки
    const enabledDays   = sched.interviewDays?.length ? sched.interviewDays : DEFAULT_DAYS
    const enabledJsDays = new Set(enabledDays.map(d => DAY_ID_TO_JS[d as keyof typeof DAY_ID_TO_JS] ?? -1))
    const fromMins  = timeToMinutes(sched.interviewFrom ?? DEFAULT_FROM)
    const toMins    = timeToMinutes(sched.interviewTo   ?? DEFAULT_TO)
    const step      = sched.slotStep ?? DEFAULT_STEP
    const maxPerDay = Number(sched.maxPerDay ?? DEFAULT_MAX) || DEFAULT_MAX
    const timezone  = sched.timezone ?? "Europe/Moscow"

    const lunchEnabled = sched.lunchEnabled ?? false
    const lunchFrom = lunchEnabled ? timeToMinutes(sched.lunchFrom ?? "13:00") : 0
    const lunchTo   = lunchEnabled ? timeToMinutes(sched.lunchTo   ?? "14:00") : 0

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

    // 5. Уже занятые слоты этой компании (tye='interview', ближайшие 14 дней)
    const now   = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + 14)

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

    // Множество занятых "YYYY-MM-DD HH:MM" по UTC (упрощение — без TZ кандидата)
    type BookedByDay = Record<string, number>
    const bookedCountByDay: BookedByDay = {}
    const bookedSlotSet   = new Set<string>()

    for (const evt of bookedEvents) {
      const d = dateToYMD(evt.startAt)
      bookedCountByDay[d] = (bookedCountByDay[d] ?? 0) + 1
      const hhmm = evt.startAt.toISOString().slice(11, 16)
      bookedSlotSet.add(`${d}T${hhmm}`)
    }

    // 6. Генерируем слоты на 14 дней
    const days: SlotDay[] = []
    const checkDate = new Date(now)
    // Начинаем со следующего дня, а не с сегодня
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)

    for (let i = 0; i < 14 && days.length < 14; i++) {
      const jsDay = checkDate.getDay()
      if (enabledJsDays.has(jsDay)) {
        const ymd = dateToYMD(checkDate)
        const dayBooked = bookedCountByDay[ymd] ?? 0

        if (dayBooked < maxPerDay) {
          const rawSlots = generateDaySlots({
            from: fromMins, to: toMins, step, lunchEnabled, lunchFrom, lunchTo,
            duration: defaultDuration,
          })

          // Исключаем уже занятые конкретные слоты
          const freeSlots = rawSlots.filter(t => !bookedSlotSet.has(`${ymd}T${t}`))

          // Применяем maxPerDay как лимит на свободные слоты в этот день
          const remaining = maxPerDay - dayBooked
          const available = freeSlots.slice(0, remaining)

          if (available.length > 0) {
            days.push({
              date:  ymd,
              label: formatDayLabel(checkDate),
              slots: available,
            })
          }
        }
      }
      checkDate.setDate(checkDate.getDate() + 1)
    }

    // 7. Собираем ответ
    const firstName = (candidate.name ?? "").split(" ")[1] ?? (candidate.name ?? "").split(" ")[0] ?? ""

    const data: SchedulePageData = {
      candidateName:     candidate.name ?? "",
      candidateFirstName: firstName,
      vacancyTitle:      row.vacancyTitle,
      companyName:       row.companyBrandName ?? row.companyName,
      companyLogo:       row.companyLogo,
      brandPrimaryColor: row.brandPrimary ?? "#3b82f6",
      brandBgColor:      row.brandBg      ?? "#f0f4ff",
      timezone,
      officeAddress:     sched.officeAddress ?? null,
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
        vacancyTitle:   vacancies.title,
        companyId:      vacancies.companyId,
        hiringDefaults: companies.hiringDefaultsJson,
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

    // 3. Определяем продолжительность из настроек
    const sched = (row.hiringDefaults as CompanyHiringDefaults)?.schedule ?? {}
    let duration = 60
    if (sched.interviewMethodConfigs) {
      const mc = sched.interviewMethodConfigs.find(c => c.method === body.method)
      if (mc) duration = mc.duration
    }

    // 4. Строим startAt / endAt
    const startAt = new Date(`${body.date}T${body.time}:00`)
    const endAt   = new Date(startAt.getTime() + duration * 60_000)

    // 5. Идемпотентность: проверяем, не забронирован ли уже этот слот этим кандидатом
    const [existing] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.companyId,   row.companyId),
        eq(calendarEvents.candidateId, candidate.id),
        eq(calendarEvents.type,        "interview"),
        eq(calendarEvents.startAt,     startAt),
      ))
      .limit(1)

    if (existing) {
      return apiSuccess({ alreadyBooked: true, eventId: existing.id })
    }

    // 6. Создаём событие
    const methodLabel = METHOD_LABELS[body.method] ?? body.method
    const interviewFormat = ["office"].includes(body.method) ? "Офис" : "Онлайн"
    const location =
      body.method === "office" && sched.officeAddress
        ? sched.officeAddress
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

    // 7. Переводим кандидата в стадию scheduled (если ещё не там)
    await db
      .update(candidates)
      .set({ stage: "scheduled", updatedAt: new Date() })
      .where(and(
        eq(candidates.id, candidate.id),
        sql`${candidates.stage} NOT IN ('scheduled','interview','interviewed','final_decision','offer','hired','rejected')`,
      ))

    return apiSuccess({ booked: true, eventId: event.id }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule POST]", err)
    return apiError("Ошибка сервера", 500)
  }
}
