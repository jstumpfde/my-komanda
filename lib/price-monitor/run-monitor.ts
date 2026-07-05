import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  priceMonitorCompetitors,
  priceMonitorForwardPrices,
  priceMonitorListingStats,
  priceMonitorObjects,
  priceMonitorOccupancy,
  priceMonitorSettings,
  type NewPriceMonitorForwardPrice,
  type NewPriceMonitorListingStats,
  type NewPriceMonitorOccupancy,
  type NewPriceMonitorSnapshot,
  type PriceMonitorObject,
  type PriceMonitorSettings,
  priceMonitorSnapshots,
} from "@/lib/db/schema"
import { getPriceSource } from "./sources/airbnb"
import { extractComplexName } from "./complex-name"
import { buildForwardCheckins, FORWARD_NIGHTS, FORWARD_OFFSETS_DAYS } from "./forward-prices"
import type { ListingDetails } from "./types"

// Платформенные дефолты — нижний уровень каскада платформа→компания→объект.
const PLATFORM_DEFAULTS = {
  radiusM: 1000,
  periods: [1, 3, 5, 7, 10, 14, 15, 25, 28, 30],
  intervalMinutes: 1440,
  runAtTime: "06:00" as string | null,
  currency: "RUB",
  autoDiscover: true,
  complexFilter: null as string | null,
}

// Пауза между запросами к сайдкару — не давим на Airbnb с одного IP.
const THROTTLE_MS = 1500
// Горизонты расчёта заполняемости (occupancy) — «загружены ли мы» на
// ближайшие 30 и 90 дней.
const OCCUPANCY_HORIZONS = [30, 90]
// /details на КАЖДОГО конкурента дорого (их сотни) — тянем только по нашему
// объекту + топ-N ближайших НЕ игнорируемых конкурентов (по distanceM возр.).
const LISTING_STATS_TOP_N_COMPETITORS = 10
// Заезд для среза цен по умолчанию: завтра (то, что гость видит при брони
// «на днях»); переопределяется settings_json.leadDays объекта.
const DEFAULT_CHECKIN_LEAD_DAYS = 1

export interface EffectiveMonitorSettings {
  radiusM: number
  periods: number[]
  intervalMinutes: number
  runAtTime: string | null
  currency: string
  autoDiscover: boolean
  complexFilter: string | null
}

export function getEffectiveSettings(
  object: PriceMonitorObject,
  company: PriceMonitorSettings | null,
): EffectiveMonitorSettings {
  const obj = object.settingsJson ?? {}
  return {
    radiusM: obj.radiusM ?? company?.radiusM ?? PLATFORM_DEFAULTS.radiusM,
    periods:
      obj.periods && obj.periods.length > 0
        ? obj.periods
        : company?.periods && company.periods.length > 0
          ? company.periods
          : PLATFORM_DEFAULTS.periods,
    intervalMinutes:
      obj.schedule?.intervalMinutes ?? company?.intervalMinutes ?? PLATFORM_DEFAULTS.intervalMinutes,
    runAtTime:
      obj.schedule?.runAtTime !== undefined
        ? obj.schedule.runAtTime
        : (company?.runAtTime ?? PLATFORM_DEFAULTS.runAtTime),
    currency: company?.currency ?? PLATFORM_DEFAULTS.currency,
    autoDiscover: obj.autoDiscover ?? PLATFORM_DEFAULTS.autoDiscover,
    complexFilter: obj.complexFilter ?? PLATFORM_DEFAULTS.complexFilter,
  }
}

function mskNow(): { minutesOfDay: number; dateIso: string } {
  const msk = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }))
  return {
    minutesOfDay: msk.getHours() * 60 + msk.getMinutes(),
    dateIso: `${msk.getFullYear()}-${String(msk.getMonth() + 1).padStart(2, "0")}-${String(msk.getDate()).padStart(2, "0")}`,
  }
}

function parseHHMM(value: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const minutes = Number(m[1]) * 60 + Number(m[2])
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null
}

// Пора ли гнать мониторинг объекта. Правила:
// - ни разу не гоняли → пора;
// - интервал < суток → чисто по интервалу (runAtTime игнорируется);
// - интервал ≥ суток и runAtTime задан → пора, когда наступило время суток
//   (МСК) и с последнего прогона прошло ≥ 0.9 интервала (допуск на дрейф крона).
export function isDue(object: PriceMonitorObject, eff: EffectiveMonitorSettings, now = new Date()): boolean {
  if (!object.isActive) return false
  if (!object.lastCheckedAt) return true
  const sinceMs = now.getTime() - object.lastCheckedAt.getTime()
  const intervalMs = eff.intervalMinutes * 60_000
  const runAt = parseHHMM(eff.runAtTime)
  if (eff.intervalMinutes < 1440 || runAt === null) {
    return sinceMs >= intervalMs
  }
  const { minutesOfDay } = mskNow()
  return minutesOfDay >= runAt && sinceMs >= intervalMs * 0.9
}

function addDays(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Считает заполняемость на горизонт дней вперёд от сегодня (включительно) по
// дням календаря сайдкара. totalDays — сколько дней окна реально нашлись в
// календаре (сайдкар может отдавать не все дни горизонта); если 0 — горизонт
// пропускается (недостаточно данных).
export function computeOccupancyForHorizon(
  days: Array<{ date: string; available: boolean }>,
  todayIso: string,
  horizonDays: number,
): { occupiedDays: number; totalDays: number; occupancyPct: number } | null {
  const endIso = addDaysIso(todayIso, horizonDays - 1)
  const windowDays = days.filter((d) => d.date >= todayIso && d.date <= endIso)
  const totalDays = windowDays.length
  if (totalDays === 0) return null
  const occupiedDays = windowDays.filter((d) => !d.available).length
  const occupancyPct = Math.round((occupiedDays / totalDays) * 100)
  return { occupiedDays, totalDays, occupancyPct }
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Собранные /details сайдкара → строка price_monitor_listing_stats.
// competitorId null = наш объект.
function toListingStatsRow(
  objectId: string,
  competitorId: string | null,
  details: ListingDetails,
  capturedAt: Date,
): NewPriceMonitorListingStats {
  return {
    objectId,
    competitorId,
    photosCount: details.photosCount,
    ratingOverall: details.ratingOverall?.toString() ?? null,
    ratingCleanliness: details.ratingCleanliness?.toString() ?? null,
    ratingLocation: details.ratingLocation?.toString() ?? null,
    ratingValue: details.ratingValue?.toString() ?? null,
    reviewCount: details.reviewCount,
    isSuperHost: details.isSuperHost,
    isGuestFavorite: details.isGuestFavorite,
    homeTier: details.homeTier,
    amenitiesCount: details.amenitiesCount,
    capturedAt,
  }
}

export interface RunResult {
  objectId: string
  periods: number[]
  ownSnapshots: number
  competitorsSeen: number
  competitorsNew: number
  competitorSnapshots: number
  occupancyHorizons: number[]
  statsCollected: number
  forwardPoints: number
  errors: string[]
}

// Один прогон мониторинга объекта: цена нашего листинга по каждому периоду +
// один поиск конкурентов в радиусе на период (поиск сразу отдаёт цены всех
// конкурентов за диапазон — 4 периода = 4 поисковых запроса, без точечных
// запросов по каждому конкуренту).
export async function runObjectMonitor(object: PriceMonitorObject): Promise<RunResult> {
  const source = getPriceSource(object.source)
  if (!source) throw new Error(`Неизвестный источник цен: ${object.source}`)

  const [company] = await db
    .select()
    .from(priceMonitorSettings)
    .where(eq(priceMonitorSettings.companyId, object.companyId))
    .limit(1)
  const eff = getEffectiveSettings(object, company ?? null)

  const result: RunResult = {
    objectId: object.id,
    periods: eff.periods,
    ownSnapshots: 0,
    competitorsSeen: 0,
    competitorsNew: 0,
    competitorSnapshots: 0,
    occupancyHorizons: [],
    statsCollected: 0,
    forwardPoints: 0,
    errors: [],
  }

  const now = new Date()
  const capturedAt = now
  const snapshots: NewPriceMonitorSnapshot[] = []

  // Известные конкуренты (для матчинга результатов поиска и ручных записей).
  const knownCompetitors = await db
    .select()
    .from(priceMonitorCompetitors)
    .where(eq(priceMonitorCompetitors.objectId, object.id))
  const byExternalId = new Map(knownCompetitors.map((c) => [`${c.source}:${c.externalId}`, c]))

  const complexFilter = eff.complexFilter?.trim().toLowerCase() || null

  const leadDays = object.settingsJson?.leadDays ?? DEFAULT_CHECKIN_LEAD_DAYS

  for (const nights of eff.periods) {
    const checkin = addDays(now, leadDays)
    const checkout = addDays(now, leadDays + nights)

    // 1. Наша цена за период
    try {
      const quote = await source.getPrice(object.externalId, checkin, checkout, {
        currency: eff.currency,
      })
      snapshots.push({
        objectId: object.id,
        competitorId: null,
        periodNights: nights,
        checkinDate: checkin,
        checkoutDate: checkout,
        priceTotal: quote.priceTotal?.toString() ?? null,
        pricePerNight: quote.pricePerNight?.toString() ?? null,
        currency: eff.currency,
        available: quote.available,
        capturedAt,
      })
      result.ownSnapshots++
    } catch (err) {
      result.errors.push(`период ${nights}н, наша цена: ${err instanceof Error ? err.message : err}`)
    }
    await sleep(THROTTLE_MS)

    // 2. Конкуренты в радиусе с ценами за тот же период
    if (!eff.autoDiscover && knownCompetitors.length === 0) continue
    if (object.lat == null || object.lng == null) {
      if (eff.autoDiscover) result.errors.push(`период ${nights}н: у объекта нет координат — авто-поиск пропущен`)
      continue
    }
    try {
      const found = await source.searchNearby({
        lat: object.lat,
        lng: object.lng,
        radiusM: eff.radiusM,
        checkin,
        checkout,
        currency: eff.currency,
      })
      for (const listing of found) {
        if (listing.externalId === object.externalId) continue
        if (complexFilter && !(listing.name ?? "").toLowerCase().includes(complexFilter)) continue
        const key = `${source.id}:${listing.externalId}`
        let competitor = byExternalId.get(key)
        if (!competitor) {
          if (!eff.autoDiscover) continue
          const [inserted] = await db
            .insert(priceMonitorCompetitors)
            .values({
              objectId: object.id,
              source: source.id,
              externalId: listing.externalId,
              url: `https://www.airbnb.com/rooms/${listing.externalId}`,
              name: listing.name,
              lat: listing.lat,
              lng: listing.lng,
              distanceM: listing.distanceM,
              complexName: extractComplexName(listing.name),
              discovered: "auto",
              lastSeenAt: capturedAt,
            })
            .onConflictDoNothing()
            .returning()
          if (!inserted) continue
          competitor = inserted
          byExternalId.set(key, inserted)
          result.competitorsNew++
        } else {
          await db
            .update(priceMonitorCompetitors)
            .set({ lastSeenAt: capturedAt, name: listing.name ?? competitor.name, distanceM: listing.distanceM ?? competitor.distanceM })
            .where(eq(priceMonitorCompetitors.id, competitor.id))
        }
        if (competitor.isIgnored) continue
        result.competitorsSeen++
        snapshots.push({
          objectId: object.id,
          competitorId: competitor.id,
          periodNights: nights,
          checkinDate: checkin,
          checkoutDate: checkout,
          priceTotal: listing.priceTotal?.toString() ?? null,
          pricePerNight:
            listing.priceTotal != null ? (listing.priceTotal / nights).toFixed(2) : null,
          currency: eff.currency,
          available: listing.priceTotal != null,
          capturedAt,
        })
        result.competitorSnapshots++
      }
    } catch (err) {
      result.errors.push(`период ${nights}н, поиск конкурентов: ${err instanceof Error ? err.message : err}`)
    }
    await sleep(THROTTLE_MS)
  }

  // Заполняемость (occupancy) нашего объекта из календаря — «загружены ли
  // мы» на ближайшие 30/90 дней. Сбой календаря НЕ валит прогон (цены уже
  // собраны выше). Не считаем для конкурентов — только наш объект.
  await sleep(THROTTLE_MS)
  try {
    const calendar = await source.getCalendar(object.externalId)
    const todayIso = now.toISOString().slice(0, 10)
    const occupancyRows: NewPriceMonitorOccupancy[] = []
    for (const horizonDays of OCCUPANCY_HORIZONS) {
      const occ = computeOccupancyForHorizon(calendar.days, todayIso, horizonDays)
      if (!occ) continue
      occupancyRows.push({
        objectId: object.id,
        competitorId: null,
        horizonDays,
        occupiedDays: occ.occupiedDays,
        totalDays: occ.totalDays,
        occupancyPct: occ.occupancyPct.toString(),
        capturedAt,
      })
      result.occupancyHorizons.push(horizonDays)
    }
    if (occupancyRows.length > 0) {
      await db.insert(priceMonitorOccupancy).values(occupancyRows)
    }
  } catch (err) {
    result.errors.push(`заполняемость (календарь): ${err instanceof Error ? err.message : err}`)
  }

  // Привлекательность (listing stats: фото/рейтинги/отзывы/tier) — дорогой
  // вызов сайдкара на каждого конкурента, поэтому берём только наш объект +
  // топ-N ближайших НЕ игнорируемых конкурентов (по distanceM возр., у кого
  // расстояние вообще известно). Сбой одной карточки не валит прогон.
  await sleep(THROTTLE_MS)
  const statsRows: NewPriceMonitorListingStats[] = []
  try {
    const ownDetails = await source.getDetails(object.externalId, eff.currency)
    statsRows.push(toListingStatsRow(object.id, null, ownDetails, capturedAt))
    result.statsCollected++
  } catch (err) {
    result.errors.push(`привлекательность, наш объект: ${err instanceof Error ? err.message : err}`)
  }
  await sleep(THROTTLE_MS)

  const topCompetitors = Array.from(byExternalId.values())
    .filter((c) => !c.isIgnored && c.distanceM != null)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, LISTING_STATS_TOP_N_COMPETITORS)

  for (const competitor of topCompetitors) {
    try {
      const details = await source.getDetails(competitor.externalId, eff.currency)
      statsRows.push(toListingStatsRow(object.id, competitor.id, details, capturedAt))
      result.statsCollected++
    } catch (err) {
      result.errors.push(
        `привлекательность, конкурент ${competitor.name ?? competitor.externalId}: ${err instanceof Error ? err.message : err}`,
      )
    }
    await sleep(THROTTLE_MS)
  }

  if (statsRows.length > 0) {
    await db.insert(priceMonitorListingStats).values(statsRows)
  }

  // «Цены вперёд» — помесячный семпл гостевой цены НАШЕГО объекта на 6
  // месяцев вперёд (сезонность). Только наш объект — конкурентов не
  // семплируем (нагрузка). Сбой одной точки не валит остальной прогон.
  await sleep(THROTTLE_MS)
  const forwardRows: NewPriceMonitorForwardPrice[] = []
  try {
    const todayIso = now.toISOString().slice(0, 10)
    const checkins = buildForwardCheckins(todayIso, FORWARD_OFFSETS_DAYS, FORWARD_NIGHTS)
    for (const point of checkins) {
      try {
        const quote = await source.getPrice(object.externalId, point.checkinDate, point.checkoutDate, {
          currency: eff.currency,
        })
        forwardRows.push({
          objectId: object.id,
          competitorId: null,
          checkinDate: point.checkinDate,
          nights: FORWARD_NIGHTS,
          priceTotal: quote.priceTotal?.toString() ?? null,
          pricePerNight: quote.pricePerNight?.toString() ?? null,
          currency: eff.currency,
          available: quote.available,
          capturedAt,
        })
        result.forwardPoints++
      } catch (err) {
        result.errors.push(
          `цены вперёд, заезд ${point.checkinDate}: ${err instanceof Error ? err.message : err}`,
        )
      }
      await sleep(THROTTLE_MS)
    }
  } catch (err) {
    result.errors.push(`цены вперёд: ${err instanceof Error ? err.message : err}`)
  }
  if (forwardRows.length > 0) {
    await db.insert(priceMonitorForwardPrices).values(forwardRows)
  }

  if (snapshots.length > 0) {
    await db.insert(priceMonitorSnapshots).values(snapshots)
  }
  await db
    .update(priceMonitorObjects)
    .set({ lastCheckedAt: capturedAt })
    .where(eq(priceMonitorObjects.id, object.id))

  return result
}

// Все объекты, которым пора обновиться (для крона). limit защищает от
// упирания в rate limit Airbnb за один тик.
export async function findDueObjects(limit = 5): Promise<PriceMonitorObject[]> {
  const active = await db
    .select()
    .from(priceMonitorObjects)
    .where(eq(priceMonitorObjects.isActive, true))
  const settingsByCompany = new Map<string, PriceMonitorSettings | null>()
  const due: PriceMonitorObject[] = []
  for (const object of active) {
    if (!settingsByCompany.has(object.companyId)) {
      const [row] = await db
        .select()
        .from(priceMonitorSettings)
        .where(eq(priceMonitorSettings.companyId, object.companyId))
        .limit(1)
      settingsByCompany.set(object.companyId, row ?? null)
    }
    const eff = getEffectiveSettings(object, settingsByCompany.get(object.companyId) ?? null)
    if (isDue(object, eff)) due.push(object)
    if (due.length >= limit) break
  }
  return due
}
