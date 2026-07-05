// Привлекательность листинга — общий помощник для API detail-страницы:
// достаёт последний срез price_monitor_listing_stats (наш объект +
// конкуренты) и считает сводный индекс привлекательности («почему конкурента
// показывают чаще нас»). Нет данных (объект ещё не прогонялся с этой фичи) →
// пустая карта, UI показывает подсказку «появится после следующего прогона».
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorListingStats, type PriceMonitorListingStats } from "@/lib/db/schema"

/** Ключ строки: "own" (наш объект) или id конкурента */
export type StatsKey = "own" | string

/**
 * Последний срез характеристик листинга по объекту — Map "own"/competitorId
 * → строка стата. Для "own" ищем срез с competitorId IS NULL, для каждого
 * конкурента — свой последний срез (может быть собран в другой момент, если
 * прогон был частичным/с ошибками).
 */
export async function loadLatestStats(objectId: string): Promise<Map<StatsKey, PriceMonitorListingStats>> {
  const rows = await db
    .select()
    .from(priceMonitorListingStats)
    .where(eq(priceMonitorListingStats.objectId, objectId))
    .orderBy(desc(priceMonitorListingStats.capturedAt))

  const result = new Map<StatsKey, PriceMonitorListingStats>()
  for (const row of rows) {
    const key: StatsKey = row.competitorId ?? "own"
    if (!result.has(key)) result.set(key, row) // первая встреченная = самая свежая (ORDER BY DESC)
  }
  return result
}

export interface AttractivenessInput {
  key: StatsKey
  photosCount: number | null
  ratingOverall: number | null
  reviewCount: number | null
}

/**
 * Индекс привлекательности (0..100) по набору строк: рейтинг 40% + фото 35% +
 * отзывы 25%. Каждый компонент нормализуется min-max по переданному набору
 * (0..1); если все значения одинаковы — 0.5 (нейтрально, не наказывать и не
 * поощрять). Отсутствующее поле у строки не штрафует её — компонент
 * пропускается и оставшиеся веса перенормализуются на сумму=1.
 */
export function computeAttractivenessIndex(rows: AttractivenessInput[]): Map<StatsKey, number> {
  const WEIGHTS = { rating: 0.4, photos: 0.35, reviews: 0.25 } as const

  const normalize = (values: Array<number | null>): Map<number, number> => {
    const present = values.filter((v): v is number => v != null)
    const map = new Map<number, number>()
    if (present.length === 0) return map
    const min = Math.min(...present)
    const max = Math.max(...present)
    for (const v of present) {
      map.set(v, max === min ? 0.5 : (v - min) / (max - min))
    }
    return map
  }

  const ratingNorm = normalize(rows.map((r) => r.ratingOverall))
  const photosNorm = normalize(rows.map((r) => r.photosCount))
  const reviewsNorm = normalize(rows.map((r) => r.reviewCount))

  const result = new Map<StatsKey, number>()
  for (const row of rows) {
    let weightSum = 0
    let scoreSum = 0

    if (row.ratingOverall != null) {
      const n = ratingNorm.get(row.ratingOverall) ?? 0.5
      scoreSum += n * WEIGHTS.rating
      weightSum += WEIGHTS.rating
    }
    if (row.photosCount != null) {
      const n = photosNorm.get(row.photosCount) ?? 0.5
      scoreSum += n * WEIGHTS.photos
      weightSum += WEIGHTS.photos
    }
    if (row.reviewCount != null) {
      const n = reviewsNorm.get(row.reviewCount) ?? 0.5
      scoreSum += n * WEIGHTS.reviews
      weightSum += WEIGHTS.reviews
    }

    const normalizedScore = weightSum > 0 ? scoreSum / weightSum : 0.5
    result.set(row.key, Math.round(normalizedScore * 100))
  }
  return result
}
