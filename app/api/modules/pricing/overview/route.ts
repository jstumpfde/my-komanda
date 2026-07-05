// GET /api/modules/pricing/overview — матрица цен всех НАШИХ объектов компании
// по периодам проживания (вид «Матрица» на /pricing). Для каждого объекта
// берём его последний own-срез (competitor_id IS NULL, максимальный
// captured_at этого объекта) и раскладываем period_nights → {perNight, total}.
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects, priceMonitorSettings, priceMonitorSnapshots } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { assertPriceMonitorModule } from "@/lib/price-monitor/entitlement"
import { loadLatestOccupancy, loadMarketOccupancy } from "@/lib/price-monitor/occupancy"

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
  marketOccupancy: Record<string, number | null>
  // Позиция к рынку на представительном периоде (для колонки матрицы).
  marketPosition: { pricierThanPct: number; band: "low" | "below" | "above" | "high" } | null
}

export interface OverviewData {
  periods: number[]
  currency: string
  // Период, на котором считается marketPosition строки (для заголовка колонки).
  positionPeriod: number
  rows: OverviewRow[]
}

export async function GET() {
  try {
    const user = await requireCompany()
    await assertPriceMonitorModule(user.companyId)

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
    // Представительный период для колонки «позиция к рынку»: 7 ночей, если есть,
    // иначе середина списка.
    const positionPeriod = periods.includes(7) ? 7 : periods[Math.floor(periods.length / 2)] ?? periods[0]

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
        const marketOccupancy = await loadMarketOccupancy(object.id)

        // Позиция к рынку на representativePeriod: наша цена/ночь vs конкуренты
        // (тот же последний срез объекта). Доля конкурентов дешевле нас → полоса.
        let marketPosition: OverviewRow["marketPosition"] = null
        const ourPn = prices[String(positionPeriod)]?.perNight ?? null
        if (latest && ourPn != null) {
          const compSnaps = await db
            .select({ perNight: priceMonitorSnapshots.pricePerNight })
            .from(priceMonitorSnapshots)
            .where(and(
              eq(priceMonitorSnapshots.objectId, object.id),
              isNotNull(priceMonitorSnapshots.competitorId),
              eq(priceMonitorSnapshots.capturedAt, latest.capturedAt),
              eq(priceMonitorSnapshots.periodNights, positionPeriod),
            ))
          const compPrices = compSnaps
            .map((s) => (s.perNight != null ? Number(s.perNight) : null))
            .filter((v): v is number => v != null)
          if (compPrices.length > 0) {
            const cheaper = compPrices.filter((v) => v < ourPn).length
            const pricierThanPct = Math.round((cheaper / compPrices.length) * 100)
            const band: "low" | "below" | "above" | "high" =
              pricierThanPct >= 75 ? "high" : pricierThanPct >= 50 ? "above" : pricierThanPct >= 25 ? "below" : "low"
            marketPosition = { pricierThanPct, band }
          }
        }

        return {
          objectId: object.id,
          name: object.name,
          complexName: object.complexName,
          isActive: object.isActive,
          lastCheckedAt: object.lastCheckedAt ? object.lastCheckedAt.toISOString() : null,
          prices,
          occupancy,
          marketOccupancy,
          marketPosition,
        }
      }),
    )

    rows.sort((a, b) => {
      const complexCmp = (a.complexName ?? "").localeCompare(b.complexName ?? "", "ru")
      if (complexCmp !== 0) return complexCmp
      return a.name.localeCompare(b.name, "ru")
    })

    const data: OverviewData = { periods, currency, positionPeriod, rows }
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
