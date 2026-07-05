// POST /api/modules/pricing/backfill-complex — заполнить ЖК (complex_name)
// эвристикой extractComplexName для уже существующих объектов/конкурентов
// компании, у которых поле ещё пустое (NULL). Идемпотентно — трогает только
// строки с complex_name IS NULL, не перетирает уже заполненные/очищенные
// вручную значения. requireDirector — массовая правка данных компании.
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorCompetitors, priceMonitorObjects } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { extractComplexName } from "@/lib/price-monitor/complex-name"

export const maxDuration = 60

export async function POST() {
  try {
    const user = await requireDirector()

    const objects = await db
      .select({ id: priceMonitorObjects.id, name: priceMonitorObjects.name })
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.companyId, user.companyId), isNull(priceMonitorObjects.complexName)))

    let objectsUpdated = 0
    for (const object of objects) {
      const complexName = extractComplexName(object.name)
      if (!complexName) continue
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
