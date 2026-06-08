/**
 * Контекст салона для sales-чатбота.
 * Собирает реальные данные о услугах, мастерах и ближайших свободных слотах
 * из booking-таблиц, чтобы бот оперировал фактической информацией салона,
 * а не выдумывал услуги и расписание.
 */

import { db } from "@/lib/db"
import { bookingServices, bookingResources, bookings } from "@/lib/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { DEFAULT_SCHEDULE, DEFAULT_BREAKS, DAY_LABELS } from "@/lib/booking/constants"

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface SalesServiceContext {
  /** Краткое обобщение услуг (напр. "Стрижка и окрашивание" или "услуги салона") */
  serviceName: string | null
  /** Диапазон цен в формате "от 500 до 3000₽" или "от 500₽" если одна услуга */
  priceRange: string | null
  /** Полный человекочитаемый текст для системного промпта бота (на русском) */
  contextText: string | null
}

// ─── Вспомогательные функции (переиспользованы из slots/route.ts) ─────────────

/** Перевести "HH:MM" в минуты от начала суток */
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/** Перевести минуты в строку "HH:MM" */
function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Ключи дней недели по индексу Date.getDay() (0=вс, 1=пн, ...) */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

/** Форматировать дату Date в строку "YYYY-MM-DD" (локальная дата, без UTC-смещения) */
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Сформировать человекочитаемую дату "Пн 9 июня" */
const MONTH_NAMES = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
]
function formatDateReadable(d: Date): string {
  const dayKey = DAY_KEYS[d.getDay()]
  const dayLabel = DAY_LABELS[dayKey] ?? dayKey
  return `${dayLabel} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

/** Относительная метка дня: "Сегодня (Пн 8 июня)" / "Завтра (Вт 9 июня)" / "Ср 10 июня" */
function relativeDayLabel(d: Date): string {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000)
  const base = formatDateReadable(d)
  if (diff === 0) return `Сегодня (${base})`
  if (diff === 1) return `Завтра (${base})`
  return base
}

/** Конвертировать копейки в рубли с символом ₽ */
function formatPrice(kopecks: number): string {
  return `${Math.round(kopecks / 100)}₽`
}

// ─── Основная функция ─────────────────────────────────────────────────────────

/**
 * Собрать контекст салона для промпта sales-чатбота.
 *
 * @param tenantId  UUID компании (тенанта)
 * @param opts.daysAhead  На сколько дней вперёд искать свободные слоты (по умолчанию 3)
 */
export async function buildServiceContext(
  tenantId: string,
  opts?: { daysAhead?: number },
): Promise<SalesServiceContext> {
  const daysAhead = opts?.daysAhead ?? 3

  // ── 1. Загрузить активные услуги ─────────────────────────────────────────
  const services = await db
    .select()
    .from(bookingServices)
    .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.isActive, true)))
    .orderBy(bookingServices.sortOrder)

  // Если услуг нет — бот работает без данных (общие фразы)
  if (services.length === 0) {
    return { serviceName: null, priceRange: null, contextText: null }
  }

  // ── 2. Загрузить активных мастеров/специалистов ───────────────────────────
  const resources = await db
    .select()
    .from(bookingResources)
    .where(and(eq(bookingResources.tenantId, tenantId), eq(bookingResources.isActive, true)))

  // ── 3. Рассчитать ближайшие свободные слоты ───────────────────────────────
  // Логика слотов переиспользована из app/api/modules/booking/slots/route.ts:
  // — берём расписание мастера (или DEFAULT_SCHEDULE если нет),
  // — вычитаем существующие confirmed-брони и перерывы,
  // — шаг 30 мин (как в роуте), длительность — первой активной услуги.
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Дни для поиска
  const checkDates: Date[] = []
  for (let i = 0; i < daysAhead + 7; i++) {
    // +7 запас — пропускаем выходные, набираем нужное кол-во рабочих дней
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    checkDates.push(d)
  }

  // Взять длительность первой услуги как базовую (для расчёта слотов)
  const baseDuration = services[0].duration

  // Загрузить все confirmed-брони на ближайшие daysAhead+7 дней одним запросом
  const fromDateStr = formatDate(checkDates[0])
  const toDateStr = formatDate(checkDates[checkDates.length - 1])

  // Дата хранится как "YYYY-MM-DD" (тип date), строковое сравнение корректно работает.
  // Используем gte + lte из drizzle-orm для фильтрации диапазона дат.
  const existingBookings = await db
    .select({
      date:       bookings.date,
      startTime:  bookings.startTime,
      endTime:    bookings.endTime,
      resourceId: bookings.resourceId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        eq(bookings.status, "confirmed"),
        gte(bookings.date, fromDateStr),
        lte(bookings.date, toDateStr),
      ),
    )

  // Сгруппировать брони по дате+мастеру
  const bookingsByDateResource: Record<string, Array<{ start: number; end: number }>> = {}
  for (const b of existingBookings) {
    const key = `${b.date}::${b.resourceId ?? "__any__"}`
    if (!bookingsByDateResource[key]) bookingsByDateResource[key] = []
    bookingsByDateResource[key].push({
      start: timeToMin(b.startTime),
      end: timeToMin(b.endTime),
    })
  }

  // Свободные слоты: union по всем мастерам, разброс времени, несколько дней.
  void daysAhead
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })()
  const todayStr = formatDate(today)
  interface DaySlots { label: string; times: string[] }
  const daySlotsList: DaySlots[] = []
  const MAX_DAYS = 4
  const MAX_PER_DAY = 5

  for (const d of checkDates) {
    if (daySlotsList.length >= MAX_DAYS) break
    const dateStr = formatDate(d)
    const dayKey = DAY_KEYS[d.getDay()]
    const isToday = dateStr === todayStr

    // Союз свободных стартов по всем мастерам (или дефолт-расписание).
    const freeSet = new Set<number>()
    const resourceList = resources.length > 0 ? resources : [null]
    for (const resource of resourceList) {
      const schedule = (resource?.schedule as typeof DEFAULT_SCHEDULE) ?? DEFAULT_SCHEDULE
      const breaks = (resource?.breaks as typeof DEFAULT_BREAKS) ?? DEFAULT_BREAKS
      const daySchedule = schedule[dayKey]
      if (!daySchedule || !daySchedule.active) continue

      const dayStart = timeToMin(daySchedule.start)
      const dayEnd = timeToMin(daySchedule.end)
      const busyKey = `${dateStr}::${resource?.id ?? "__any__"}`
      const busy = [...(bookingsByDateResource[busyKey] ?? [])]
      for (const br of breaks) busy.push({ start: timeToMin(br.start), end: timeToMin(br.end) })

      for (let t = dayStart; t + baseDuration <= dayEnd; t += 30) {
        if (isToday && t <= nowMin + 30) continue // сегодня — только будущее время
        const slotEnd = t + baseDuration
        const conflict = busy.some((r) => t < r.end && slotEnd > r.start)
        if (!conflict) freeSet.add(t)
      }
    }

    if (freeSet.size === 0) continue
    // Разброс: равномерно выбрать до MAX_PER_DAY времён за день.
    const sorted = [...freeSet].sort((a, b) => a - b)
    const step = Math.max(1, Math.floor(sorted.length / MAX_PER_DAY))
    const picked: number[] = []
    for (let i = 0; i < sorted.length && picked.length < MAX_PER_DAY; i += step) picked.push(sorted[i])
    daySlotsList.push({ label: relativeDayLabel(d), times: picked.map(minToTime) })
  }

  // ── 4. Собрать contextText ─────────────────────────────────────────────────

  // Список услуг
  const servicesLines = services.map((s) => {
    const price = s.price != null ? ` — ${formatPrice(s.price)}` : ""
    const duration = ` (${s.duration} мин)`
    // Если у услуги есть мастера, укажем (упрощённо: все активные специалисты)
    return `• ${s.name}${duration}${price}`
  })

  // Мастера
  const specialists = resources.filter((r) => r.type === "specialist")
  const masterLines = specialists.length > 0
    ? specialists.map((r) => `• ${r.name}`)
    : []

  // Слоты
  let slotsText = ""
  if (daySlotsList.length > 0) {
    const entries = daySlotsList.map((ds) => `${ds.label}: ${ds.times.join(", ")}`).join("; ")
    slotsText = `\nСвободное время для записи: ${entries}.`
  } else {
    slotsText = "\nСвободных слотов на ближайшие дни не найдено — уточните у администратора."
  }

  // Расписание работы из первого ресурса или дефолт
  const scheduleRef = (resources[0]?.schedule as typeof DEFAULT_SCHEDULE) ?? DEFAULT_SCHEDULE
  const workDays = Object.entries(scheduleRef)
    .filter(([, v]) => v.active)
    .map(([k, v]) => `${DAY_LABELS[k]} ${v.start}–${v.end}`)
    .join(", ")
  const scheduleText = workDays ? `\nРабочее время: ${workDays}.` : ""

  const parts: string[] = [
    "=== Услуги салона ===",
    servicesLines.join("\n"),
  ]

  if (masterLines.length > 0) {
    parts.push("\nМастера:", masterLines.join("\n"))
  }

  if (scheduleText) parts.push(scheduleText)
  parts.push(slotsText)

  const contextText = parts.join("\n")

  // ── 5. serviceName и priceRange ───────────────────────────────────────────

  const serviceName = services.length === 1
    ? services[0].name
    : "услуги салона"

  const prices = services
    .map((s) => s.price)
    .filter((p): p is number => p != null && p > 0)

  let priceRange: string | null = null
  if (prices.length === 1) {
    priceRange = `от ${formatPrice(prices[0])}`
  } else if (prices.length > 1) {
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    priceRange = minP === maxP
      ? `от ${formatPrice(minP)}`
      : `от ${formatPrice(minP)} до ${formatPrice(maxP)}`
  }

  return { serviceName, priceRange, contextText }
}
