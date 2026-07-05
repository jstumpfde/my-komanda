// GET /api/modules/pricing/objects/[id]/comparison?at=<ISO> — таблица сравнения
// цен нашего объекта и конкурентов по срезу (captured_at).
import { NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  priceMonitorCompetitors,
  priceMonitorObjects,
  priceMonitorSettings,
  priceMonitorSnapshots,
} from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getEffectiveSettings } from "@/lib/price-monitor/run-monitor"
import { computeAttractivenessIndex, loadLatestStats } from "@/lib/price-monitor/listing-stats"

const MAX_CAPTURES = 30

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Перцентиль по методу линейной интерполяции (p в 0..100).
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)
}

// Позиция нашей цены среди конкурентов: доля конкурентов ДЕШЕВЛЕ нас (0..100) —
// «мы дороже N% конкурентов». Полоса рынка: low/below/above/high.
type MarketBand = "low" | "below" | "above" | "high"
function marketPosition(ownPerNight: number | null, competitorPrices: number[]): {
  pricierThanPct: number
  band: MarketBand
} | null {
  if (ownPerNight == null || competitorPrices.length === 0) return null
  const cheaper = competitorPrices.filter((v) => v < ownPerNight).length
  const pricierThanPct = Math.round((cheaper / competitorPrices.length) * 100)
  const band: MarketBand =
    pricierThanPct >= 75 ? "high" : pricierThanPct >= 50 ? "above" : pricierThanPct >= 25 ? "below" : "low"
  return { pricierThanPct, band }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params

    const [object] = await db
      .select()
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))
      .limit(1)
    if (!object) return apiError("Объект не найден", 404)

    const [companySettings] = await db
      .select()
      .from(priceMonitorSettings)
      .where(eq(priceMonitorSettings.companyId, user.companyId))
      .limit(1)
    const eff = getEffectiveSettings(object, companySettings ?? null)

    // Список различных capturedAt (до MAX_CAPTURES последних), DESC.
    const captureRows = await db
      .selectDistinct({ capturedAt: priceMonitorSnapshots.capturedAt })
      .from(priceMonitorSnapshots)
      .where(eq(priceMonitorSnapshots.objectId, object.id))
      .orderBy(desc(priceMonitorSnapshots.capturedAt))
      .limit(MAX_CAPTURES)

    const captures = captureRows.map((r) => r.capturedAt.toISOString())

    if (captures.length === 0) {
      return apiSuccess({
        capturedAt: null,
        captures: [],
        currency: eff.currency,
        periods: eff.periods,
        rows: [],
        medians: {},
        deltas: {},
        attractiveness: { rows: [], hasData: false },
      })
    }

    const atParam = req.nextUrl.searchParams.get("at")
    let capturedAt: string
    if (atParam) {
      const atDate = new Date(atParam)
      if (Number.isNaN(atDate.getTime())) return apiError("Некорректный параметр at", 400)
      // Последний срез ≤ at, либо самый свежий, если такого нет.
      const found = captures.find((c) => new Date(c).getTime() <= atDate.getTime())
      capturedAt = found ?? captures[captures.length - 1]
    } else {
      capturedAt = captures[0]
    }

    const capturedAtDate = new Date(capturedAt)

    // Снапшоты этого среза (одинаковый capturedAt).
    const snapshots = await db
      .select()
      .from(priceMonitorSnapshots)
      .where(and(
        eq(priceMonitorSnapshots.objectId, object.id),
        eq(priceMonitorSnapshots.capturedAt, capturedAtDate),
      ))

    const competitors = await db
      .select()
      .from(priceMonitorCompetitors)
      .where(eq(priceMonitorCompetitors.objectId, object.id))
    const competitorById = new Map(competitors.map((c) => [c.id, c]))

    let currency = eff.currency
    const ownSnap = snapshots.find((s) => s.competitorId === null)
    if (ownSnap) currency = ownSnap.currency

    type Row = {
      kind: "own" | "competitor"
      competitorId: string | null
      name: string
      url: string | null
      distanceM: number | null
      complexName: string | null
      isIgnored: boolean
      prices: Record<string, { total: number | null; perNight: number | null; available: boolean }>
      _minPerNight: number | null
    }

    const rowsByKey = new Map<string, Row>()

    const ownRow: Row = {
      kind: "own",
      competitorId: null,
      name: object.name,
      url: object.url,
      distanceM: null,
      complexName: object.complexName,
      isIgnored: false,
      prices: {},
      _minPerNight: null,
    }
    rowsByKey.set("own", ownRow)

    for (const snap of snapshots) {
      const key = snap.competitorId ?? "own"
      let row = rowsByKey.get(key)
      if (!row) {
        const competitor = snap.competitorId ? competitorById.get(snap.competitorId) : null
        row = {
          kind: "competitor",
          competitorId: snap.competitorId,
          name: competitor?.name ?? "Конкурент",
          url: competitor?.url ?? null,
          distanceM: competitor?.distanceM ?? null,
          complexName: competitor?.complexName ?? null,
          isIgnored: competitor?.isIgnored ?? false,
          prices: {},
          _minPerNight: null,
        }
        rowsByKey.set(key, row)
      }
      const perNight = snap.pricePerNight != null ? Number(snap.pricePerNight) : null
      row.prices[String(snap.periodNights)] = {
        total: snap.priceTotal != null ? Number(snap.priceTotal) : null,
        perNight,
        available: snap.available,
      }
    }

    // Включаем конкурентов, у которых нет снапшотов в этом срезе, но которые
    // существуют (isIgnored важна для UI даже без цен) — не обязательно по
    // контракту, но иначе они молча исчезают из истории. Ограничимся теми, у
    // кого есть хоть один снапшот когда-либо ИЛИ они уже есть в rowsByKey.
    // (Контракт требует rows только из снапшотов текущего среза — оставляем как есть.)

    const minPeriod = Math.min(...eff.periods)
    for (const row of rowsByKey.values()) {
      const minPrice = row.prices[String(minPeriod)]?.perNight
      row._minPerNight = minPrice ?? Object.values(row.prices).find((p) => p.perNight != null)?.perNight ?? null
    }

    const ordered = Array.from(rowsByKey.values())
    const own = ordered.find((r) => r.kind === "own")!
    const competitorRows = ordered
      .filter((r) => r.kind === "competitor")
      .sort((a, b) => {
        if (a._minPerNight == null && b._minPerNight == null) return 0
        if (a._minPerNight == null) return 1
        if (b._minPerNight == null) return -1
        return a._minPerNight - b._minPerNight
      })

    const rows = [own, ...competitorRows].map(({ _minPerNight, ...rest }) => rest)

    const medians: Record<string, number | null> = {}
    const deltas: Record<string, number | null> = {}
    const percentiles: Record<string, { p25: number | null; p50: number | null; p75: number | null }> = {}
    const marketPos: Record<string, { pricierThanPct: number; band: MarketBand } | null> = {}
    for (const nights of eff.periods) {
      const key = String(nights)
      const activePrices = competitorRows
        .filter((r) => !r.isIgnored)
        .map((r) => r.prices[key]?.perNight)
        .filter((v): v is number => v != null)
      const med = median(activePrices)
      medians[key] = med
      const ownPerNight = own.prices[key]?.perNight ?? null
      deltas[key] = med != null && med !== 0 && ownPerNight != null
        ? Math.round(((ownPerNight - med) / med) * 1000) / 10
        : null
      percentiles[key] = {
        p25: percentile(activePrices, 25),
        p50: med,
        p75: percentile(activePrices, 75),
      }
      marketPos[key] = marketPosition(ownPerNight, activePrices)
    }

    // Привлекательность — «почему конкурента показывают чаще нас». Только
    // строки, по которым реально есть последний срез listing-stats (нет
    // данных до первого прогона с этой фичи — тогда hasData=false).
    const latestStats = await loadLatestStats(object.id)
    const attractivenessInputs = Array.from(latestStats.entries()).map(([key, stat]) => ({
      key,
      photosCount: stat.photosCount,
      ratingOverall: stat.ratingOverall != null ? Number(stat.ratingOverall) : null,
      reviewCount: stat.reviewCount,
    }))
    const indexByKey = computeAttractivenessIndex(attractivenessInputs)

    const attractivenessRows = Array.from(latestStats.entries()).map(([key, stat]) => ({
      key,
      name: key === "own" ? object.name : (competitorById.get(key)?.name ?? "Конкурент"),
      photosCount: stat.photosCount,
      ratingOverall: stat.ratingOverall != null ? Number(stat.ratingOverall) : null,
      reviewCount: stat.reviewCount,
      isSuperHost: stat.isSuperHost,
      isGuestFavorite: stat.isGuestFavorite,
      amenitiesCount: stat.amenitiesCount,
      searchRank: stat.searchRank ?? null,
      index: indexByKey.get(key) ?? 0,
    }))
    attractivenessRows.sort((a, b) => b.index - a.index)

    return apiSuccess({
      capturedAt,
      captures,
      currency,
      periods: eff.periods,
      rows,
      medians,
      deltas,
      percentiles,
      marketPos,
      attractiveness: {
        rows: attractivenessRows,
        hasData: attractivenessRows.length > 0,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
