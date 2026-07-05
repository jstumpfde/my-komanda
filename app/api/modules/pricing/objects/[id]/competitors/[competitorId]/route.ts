// PATCH/DELETE /api/modules/pricing/objects/[id]/competitors/[competitorId]
// Tenant-изоляция через join: конкурент должен принадлежать объекту, который
// принадлежит компании пользователя.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorCompetitors, priceMonitorObjects } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function loadOwnedCompetitor(companyId: string, objectId: string, competitorId: string) {
  const [object] = await db
    .select({ id: priceMonitorObjects.id })
    .from(priceMonitorObjects)
    .where(and(eq(priceMonitorObjects.id, objectId), eq(priceMonitorObjects.companyId, companyId)))
    .limit(1)
  if (!object) return null

  const [competitor] = await db
    .select()
    .from(priceMonitorCompetitors)
    .where(and(eq(priceMonitorCompetitors.id, competitorId), eq(priceMonitorCompetitors.objectId, objectId)))
    .limit(1)
  return competitor ?? null
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; competitorId: string }> },
) {
  try {
    const user = await requireCompany()
    const { id, competitorId } = await ctx.params

    const competitor = await loadOwnedCompetitor(user.companyId, id, competitorId)
    if (!competitor) return apiError("Конкурент не найден", 404)

    const body = (await req.json().catch(() => ({}))) as { isIgnored?: boolean }
    if (typeof body.isIgnored !== "boolean") {
      return apiError("isIgnored должен быть булевым значением", 400)
    }

    const [updated] = await db
      .update(priceMonitorCompetitors)
      .set({ isIgnored: body.isIgnored })
      .where(eq(priceMonitorCompetitors.id, competitorId))
      .returning()

    return apiSuccess({ competitor: updated })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; competitorId: string }> },
) {
  try {
    const user = await requireCompany()
    const { id, competitorId } = await ctx.params

    const competitor = await loadOwnedCompetitor(user.companyId, id, competitorId)
    if (!competitor) return apiError("Конкурент не найден", 404)

    await db.delete(priceMonitorCompetitors).where(eq(priceMonitorCompetitors.id, competitorId))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
