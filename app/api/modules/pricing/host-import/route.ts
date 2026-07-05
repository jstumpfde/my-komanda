// POST /api/modules/pricing/host-import — привязать аккаунт Airbnb по ссылке
// на любое объявление хозяина: находим все его объявления и импортируем их
// как объекты мониторинга (пропускаем уже добавленные компанией).
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { airbnbSource, fetchAirbnbHostListings } from "@/lib/price-monitor/sources/airbnb"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as { url?: string }

    const url = body.url?.trim()
    if (!url) return apiError("Укажите ссылку на объявление Airbnb", 400)

    const roomId = airbnbSource.parseListingUrl(url)
    if (!roomId) return apiError("Не удалось распознать ссылку Airbnb", 400)

    const { hostId, count, listings } = await fetchAirbnbHostListings(roomId)

    if (count === 0 || hostId === null) {
      return apiSuccess({
        hostId,
        imported: 0,
        skipped: 0,
        total: count,
        warning: "Не удалось определить объявления хозяина",
      })
    }

    let imported = 0
    let skipped = 0

    for (const listing of listings) {
      const [existing] = await db
        .select({ id: priceMonitorObjects.id })
        .from(priceMonitorObjects)
        .where(and(
          eq(priceMonitorObjects.companyId, user.companyId),
          eq(priceMonitorObjects.source, "airbnb"),
          eq(priceMonitorObjects.externalId, listing.externalId),
        ))
        .limit(1)

      if (existing) {
        skipped++
        continue
      }

      let lat: number | null = null
      let lng: number | null = null
      try {
        const resolved = await airbnbSource.resolveListing(listing.externalId)
        lat = resolved.lat
        lng = resolved.lng
      } catch (err) {
        console.error(
          "[pricing/host-import] resolveListing failed:",
          listing.externalId,
          err instanceof Error ? err.message : err,
        )
      }

      await db.insert(priceMonitorObjects).values({
        companyId: user.companyId,
        name: listing.name || `Airbnb ${listing.externalId}`,
        source: "airbnb",
        externalId: listing.externalId,
        url: `https://www.airbnb.com/rooms/${listing.externalId}`,
        lat,
        lng,
      })
      imported++
    }

    return apiSuccess({ hostId, imported, skipped, total: count })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
