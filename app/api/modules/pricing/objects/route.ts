// GET  /api/modules/pricing/objects — список объектов компании с агрегатами
//      (кол-во конкурентов, последняя своя цена/ночь).
// POST /api/modules/pricing/objects — добавить объект по ссылке Airbnb.
import { NextRequest } from "next/server"
import { and, count, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorCompetitors, priceMonitorObjects, priceMonitorSnapshots } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { airbnbSource } from "@/lib/price-monitor/sources/airbnb"

export async function GET() {
  try {
    const user = await requireCompany()

    const objects = await db
      .select()
      .from(priceMonitorObjects)
      .where(eq(priceMonitorObjects.companyId, user.companyId))
      .orderBy(priceMonitorObjects.createdAt)

    const result = await Promise.all(
      objects.map(async (object) => {
        const [{ value: competitorsCount }] = await db
          .select({ value: count() })
          .from(priceMonitorCompetitors)
          .where(eq(priceMonitorCompetitors.objectId, object.id))

        // Последний срез нашего объекта (competitorId IS NULL) с минимальным
        // periodNights среди снапшотов с тем же (последним) captured_at.
        const [latestOwn] = await db
          .select({
            pricePerNight: priceMonitorSnapshots.pricePerNight,
            currency: priceMonitorSnapshots.currency,
            periodNights: priceMonitorSnapshots.periodNights,
            capturedAt: priceMonitorSnapshots.capturedAt,
          })
          .from(priceMonitorSnapshots)
          .where(and(
            eq(priceMonitorSnapshots.objectId, object.id),
            isNull(priceMonitorSnapshots.competitorId),
          ))
          .orderBy(sql`${priceMonitorSnapshots.capturedAt} DESC`, sql`${priceMonitorSnapshots.periodNights} ASC`)
          .limit(1)

        return {
          id: object.id,
          name: object.name,
          source: object.source,
          externalId: object.externalId,
          url: object.url,
          complexName: object.complexName,
          isActive: object.isActive,
          lastCheckedAt: object.lastCheckedAt,
          competitorsCount,
          latestOwnPerNight: latestOwn?.pricePerNight != null ? Number(latestOwn.pricePerNight) : null,
          currency: latestOwn?.currency ?? null,
        }
      }),
    )

    return apiSuccess({ objects: result })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      url?: string
      complexName?: string
    }

    const name = body.name?.trim()
    const url = body.url?.trim()
    if (!name) return apiError("Укажите название объекта", 400)
    if (!url) return apiError("Укажите ссылку на объявление Airbnb", 400)

    const externalId = airbnbSource.parseListingUrl(url)
    if (!externalId) return apiError("Не удалось распознать ссылку Airbnb", 400)

    let lat: number | null = null
    let lng: number | null = null
    let warning: string | undefined

    try {
      const resolved = await airbnbSource.resolveListing(externalId)
      lat = resolved.lat
      lng = resolved.lng
    } catch (err) {
      warning = "Не удалось получить координаты объекта (сервис недоступен) — объект создан без координат, авто-поиск конкурентов будет недоступен до следующего успешного прогона."
      console.error("[pricing/objects] resolveListing failed:", err instanceof Error ? err.message : err)
    }

    const [object] = await db
      .insert(priceMonitorObjects)
      .values({
        companyId: user.companyId,
        name,
        source: "airbnb",
        externalId,
        url,
        lat,
        lng,
        complexName: body.complexName?.trim() || null,
      })
      .returning()

    return apiSuccess({ object, ...(warning ? { warning } : {}) }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
