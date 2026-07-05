// POST /api/modules/pricing/objects/[id]/competitors — ручное добавление конкурента по ссылке.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorCompetitors, priceMonitorObjects } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { airbnbSource } from "@/lib/price-monitor/sources/airbnb"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params

    const [object] = await db
      .select()
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))
      .limit(1)
    if (!object) return apiError("Объект не найден", 404)

    const body = (await req.json().catch(() => ({}))) as { url?: string }
    const url = body.url?.trim()
    if (!url) return apiError("Укажите ссылку на объявление Airbnb", 400)

    const externalId = airbnbSource.parseListingUrl(url)
    if (!externalId) return apiError("Не удалось распознать ссылку Airbnb", 400)

    let lat: number | null = null
    let lng: number | null = null
    let name: string | null = null

    try {
      const resolved = await airbnbSource.resolveListing(externalId)
      lat = resolved.lat
      lng = resolved.lng
      name = resolved.title
    } catch (err) {
      console.error("[pricing/competitors] resolveListing failed:", err instanceof Error ? err.message : err)
    }

    const [inserted] = await db
      .insert(priceMonitorCompetitors)
      .values({
        objectId: object.id,
        source: "airbnb",
        externalId,
        url,
        name,
        lat,
        lng,
        discovered: "manual",
      })
      .onConflictDoNothing()
      .returning()

    if (!inserted) return apiError("Конкурент уже добавлен", 409)

    return apiSuccess({ competitor: inserted }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
