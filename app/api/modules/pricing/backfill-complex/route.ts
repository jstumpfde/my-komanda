// POST /api/modules/pricing/backfill-complex — заполнить ЖК (complex_name)
// эвристикой extractComplexName для уже существующих объектов/конкурентов
// компании, у которых поле ещё пустое (NULL). Идемпотентно — трогает только
// строки с complex_name IS NULL, не перетирает уже заполненные/очищенные
// вручную значения. requireDirector — массовая правка данных компании.
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorCompetitors, priceMonitorObjects } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { assertPriceMonitorModule } from "@/lib/price-monitor/entitlement"
import { extractComplexName } from "@/lib/price-monitor/complex-name"

export const maxDuration = 60

export async function POST() {
  try {
    const user = await requireDirector()
    await assertPriceMonitorModule(user.companyId)

    const objects = await db
      .select({ id: priceMonitorObjects.id, name: priceMonitorObjects.name })
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.companyId, user.companyId), isNull(priceMonitorObjects.complexName)))

    let objectsUpdated = 0
    const stillNull: string[] = []
    for (const object of objects) {
      const complexName = extractComplexName(object.name)
      if (!complexName) {
        stillNull.push(object.id)
        continue
      }
      await db
        .update(priceMonitorObjects)
        .set({ complexName })
        .where(and(
          eq(priceMonitorObjects.id, object.id),
          eq(priceMonitorObjects.companyId, user.companyId),
          isNull(priceMonitorObjects.complexName),
        ))
      objectsUpdated++
    }

    // Второй проход: у части объектов в названии нет маркера комплекса (вернулся
    // null), но обычно все объекты компании — один-два ЖК (частый случай: хозяин
    // привязал аккаунт с юнитами одного комплекса). Если среди уже заполненных
    // ЖК есть явно доминирующий (≥60% названных объектов), добираем им пустые.
    if (stillNull.length > 0) {
      const named = await db
        .select({ complexName: priceMonitorObjects.complexName })
        .from(priceMonitorObjects)
        .where(eq(priceMonitorObjects.companyId, user.companyId))
      const counts = new Map<string, number>()
      let namedTotal = 0
      for (const row of named) {
        if (!row.complexName) continue
        namedTotal++
        counts.set(row.complexName, (counts.get(row.complexName) ?? 0) + 1)
      }
      let dominant: string | null = null
      let dominantCount = 0
      for (const [cn, c] of counts) {
        if (c > dominantCount) {
          dominant = cn
          dominantCount = c
        }
      }
      if (dominant && namedTotal > 0 && dominantCount / namedTotal >= 0.6) {
        for (const id of stillNull) {
          await db
            .update(priceMonitorObjects)
            .set({ complexName: dominant })
            .where(and(
              eq(priceMonitorObjects.id, id),
              eq(priceMonitorObjects.companyId, user.companyId),
              isNull(priceMonitorObjects.complexName),
            ))
          objectsUpdated++
        }
      }
    }

    // Конкуренты принадлежат объектам компании — джойним через объекты компании.
    const companyObjectIds = (
      await db
        .select({ id: priceMonitorObjects.id })
        .from(priceMonitorObjects)
        .where(eq(priceMonitorObjects.companyId, user.companyId))
    ).map((o) => o.id)

    let competitorsUpdated = 0
    if (companyObjectIds.length > 0) {
      const competitorIdSet = new Set(companyObjectIds)
      const competitors = await db
        .select({ id: priceMonitorCompetitors.id, name: priceMonitorCompetitors.name, objectId: priceMonitorCompetitors.objectId })
        .from(priceMonitorCompetitors)
        .where(isNull(priceMonitorCompetitors.complexName))

      for (const competitor of competitors) {
        if (!competitorIdSet.has(competitor.objectId)) continue
        const complexName = extractComplexName(competitor.name)
        if (!complexName) continue
        await db
          .update(priceMonitorCompetitors)
          .set({ complexName })
          .where(and(eq(priceMonitorCompetitors.id, competitor.id), isNull(priceMonitorCompetitors.complexName)))
        competitorsUpdated++
      }
    }

    return apiSuccess({ objectsUpdated, competitorsUpdated })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
