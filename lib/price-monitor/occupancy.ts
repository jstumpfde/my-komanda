// Заполняемость (occupancy) объекта — общий помощник для overview и detail
// API: достаёт последний срез occupancy (competitor_id IS NULL, максимальный
// captured_at) и раскладывает по горизонтам {30: pct, 90: pct}. Нет данных
// (объект ещё не прогонялся с этой фичи) → null для каждого горизонта.
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorOccupancy } from "@/lib/db/schema"

export const OCCUPANCY_HORIZONS = [30, 90]

export async function loadLatestOccupancy(objectId: string): Promise<Record<string, number | null>> {
  const occupancy: Record<string, number | null> = {}
  for (const h of OCCUPANCY_HORIZONS) occupancy[String(h)] = null

  const [latest] = await db
    .select({ capturedAt: priceMonitorOccupancy.capturedAt })
    .from(priceMonitorOccupancy)
    .where(and(eq(priceMonitorOccupancy.objectId, objectId), isNull(priceMonitorOccupancy.competitorId)))
    .orderBy(desc(priceMonitorOccupancy.capturedAt))
    .limit(1)

  if (!latest) return occupancy

  const rows = await db
    .select()
    .from(priceMonitorOccupancy)
    .where(and(
      eq(priceMonitorOccupancy.objectId, objectId),
      isNull(priceMonitorOccupancy.competitorId),
      eq(priceMonitorOccupancy.capturedAt, latest.capturedAt),
    ))

  for (const row of rows) {
    occupancy[String(row.horizonDays)] = row.occupancyPct != null ? Number(row.occupancyPct) : null
  }

  return occupancy
}
