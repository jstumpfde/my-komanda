import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { radarItems, type RadarItemStatus } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireRadarAccess } from "@/lib/radar/access"

const STATUSES: RadarItemStatus[] = ["new", "apply", "skip", "later"]

// PATCH — статус «применяю/не применяю/позже», тема, теги, сервис.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRadarAccess()
    const { id } = await params
    const b = await req.json().catch(() => ({})) as Record<string, unknown>

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof b.status === "string" && STATUSES.includes(b.status as RadarItemStatus)) patch.status = b.status
    if ("topicId" in b) patch.topicId = (b.topicId as string) || null
    if (Array.isArray(b.tags)) patch.tags = b.tags as string[]
    if ("service" in b) patch.service = (b.service as string) || null

    const [row] = await db.update(radarItems).set(patch)
      .where(and(eq(radarItems.id, id), eq(radarItems.userId, user.id)))
      .returning({ id: radarItems.id, status: radarItems.status })
    if (!row) return apiError("Не найдено", 404)
    return apiSuccess(row)
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}

// DELETE — убрать единицу контента из базы знаний.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRadarAccess()
    const { id } = await params
    const [row] = await db.delete(radarItems)
      .where(and(eq(radarItems.id, id), eq(radarItems.userId, user.id)))
      .returning({ id: radarItems.id })
    if (!row) return apiError("Не найдено", 404)
    return apiSuccess({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}
