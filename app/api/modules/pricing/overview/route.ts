// GET /api/modules/pricing/overview — матрица цен всех НАШИХ объектов компании
// по периодам проживания (вид «Матрица» на /pricing). Для каждого объекта
// берём его последний own-срез (competitor_id IS NULL, максимальный
// captured_at этого объекта) и раскладываем period_nights → {perNight, total}.
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects, priceMonitorSettings, priceMonitorSnapshots } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { loadLatestOccupancy } from "@/lib/price-monitor/occupancy"

const DEFAULT_PERIODS = [1, 3, 5, 7, 10, 14, 15, 25, 28, 30]
const DEFAULT_CURRENCY = "RUB"

export interface OverviewPriceCell {
  perNight: number | null
  total: number | null
}

export interface OverviewRow {
  objectId: string
  name: string
  complexName: string | null
  isActive: boolean
  lastCheckedAt: string | null
  prices: Record<string, OverviewPriceCell>
  occupancy: Record<string, number | null>
}

export interface OverviewData {
  periods: number[]
  currency: string
  rows: OverviewRow[]
}

export async function GET() {
  try {
    const user = await requireCompany()

    const [companySettings] = await db
      .select()
      .from(priceMonitorSettings)
      .where(eq(priceMonitorSettings.companyId, user.companyId))
      .limit(1)

    const periods =
      companySettings?.periods && companySettings.periods.length > 0
        ? companySettings.periods
        : DEFAULT_PERIODS
    const currency = companySettings?.currency || DEFAULT_CURRENCY

    const objects = await db
      .select()
      .from(priceMonitorObjects)
      .where(eq(priceMonitorObjects.companyId, user.companyId))

    const rows: OverviewRow[] = await Promise.all(
      objects.map(async (object) => {
        const prices: Record<string, OverviewPriceCell> = {}
        for (const p of periods) {
          prices[String(p)] = { perNight: null, total: null }
        }

        // Последний own-срез объекта: максимальный captured_at среди
        // снапшотов с competitor_id IS NULL.
        const [latest] = await db
          .select({ capturedAt: priceMonitorSnapshots.capturedAt })
          .from(priceMonitorSnapshots)
          .where(and(
            eq(priceMonitorSnapshots.objectId, object.id),
            isNull(priceMonitorSnapshots.competitorId),
          ))
          .orderBy(desc(priceMonitorSnapshots.capturedAt))
          .limit(1)

        if (latest) {
          const snapshots = await db
            .select()
            .from(priceMonitorSnapshots)
            .where(and(
              eq(priceMonitorSnapshots.objectId, object.id),
              isNull(priceMonitorSnapshots.competitorId),
              eq(priceMonitorSnapshots.capturedAt, latest.capturedAt),
            ))

          for (const snap of snapshots) {
            prices[String(snap.periodNights)] = {
              perNight: snap.pricePerNight != null ? Number(snap.pricePerNight) : null,
              total: snap.priceTotal != null ? Number(snap.priceTotal) : null,
            }
          }
        }

        const occupancy = await loadLatestOccupancy(object.id)

        return {
          objectId: object.id,
          name: object.name,
          complexName: object.complexName,
          isActive: object.isActive,
          lastCheckedAt: object.lastCheckedAt ? object.lastCheckedAt.toISOString() : null,
          prices,
          occupancy,
        }
      }),
    )

    rows.sort((a, b) => {
      const complexCmp = (a.complexName ?? "").localeCompare(b.complexName ?? "", "ru")
      if (complexCmp !== 0) return complexCmp
      return a.name.localeCompare(b.name, "ru")
    })

    const data: OverviewData = { periods, currency, rows }
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
