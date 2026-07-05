// «Цены вперёд» — помесячный семпл гостевой цены нашего объекта на 6 месяцев
// вперёд (сезонность: куда площадка двигает цену на высокий сезон, где даты
// закрыты). Общий помощник: чистая функция построения дат заездов (движок) +
// загрузка последнего среза (API detail-страницы).
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorForwardPrices } from "@/lib/db/schema"

// Сколько ночей семплируем на каждой точке (гостевой сценарий «неделя»).
export const FORWARD_NIGHTS = 7
// Горизонты вперёд от сегодня (дни) — 6 точек ≈ 6 месяцев.
export const FORWARD_OFFSETS_DAYS = [30, 60, 90, 120, 150, 180]

export interface ForwardCheckin {
  checkinDate: string
  checkoutDate: string
  offsetDays: number
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Строит список точек заезда (сегодня+offset, на nights ночей) для семпла
 * помесячных цен. Чистая функция — не трогает БД/сеть, легко тестируется.
 */
export function buildForwardCheckins(
  todayIso: string,
  offsets: number[] = FORWARD_OFFSETS_DAYS,
  nights: number = FORWARD_NIGHTS,
): ForwardCheckin[] {
  return offsets.map((offsetDays) => {
    const checkinDate = addDaysIso(todayIso, offsetDays)
    const checkoutDate = addDaysIso(checkinDate, nights)
    return { checkinDate, checkoutDate, offsetDays }
  })
}

export interface ForwardPoint {
  checkinDate: string
  pricePerNight: number | null
  priceTotal: number | null
  available: boolean
}

/**
 * Последний срез forward-цен нашего объекта (competitor_id IS NULL,
 * максимальный captured_at), отсортирован по checkin_date возр. Нет данных
 * (объект ещё не прогонялся с этой фичи) → { nights: null, currency: null,
 * points: [] }.
 */
export async function loadLatestForward(objectId: string): Promise<{
  nights: number | null
  currency: string | null
  points: ForwardPoint[]
}> {
  const [latest] = await db
    .select({ capturedAt: priceMonitorForwardPrices.capturedAt })
    .from(priceMonitorForwardPrices)
    .where(and(eq(priceMonitorForwardPrices.objectId, objectId), isNull(priceMonitorForwardPrices.competitorId)))
    .orderBy(desc(priceMonitorForwardPrices.capturedAt))
    .limit(1)

  if (!latest) return { nights: null, currency: null, points: [] }

  const rows = await db
    .select()
    .from(priceMonitorForwardPrices)
    .where(and(
      eq(priceMonitorForwardPrices.objectId, objectId),
      isNull(priceMonitorForwardPrices.competitorId),
      eq(priceMonitorForwardPrices.capturedAt, latest.capturedAt),
    ))

  rows.sort((a, b) => (a.checkinDate < b.checkinDate ? -1 : a.checkinDate > b.checkinDate ? 1 : 0))

  return {
    nights: rows[0]?.nights ?? null,
    currency: rows[0]?.currency ?? null,
    points: rows.map((row) => ({
      checkinDate: row.checkinDate,
      pricePerNight: row.pricePerNight != null ? Number(row.pricePerNight) : null,
      priceTotal: row.priceTotal != null ? Number(row.priceTotal) : null,
      available: row.available,
    })),
  }
}
