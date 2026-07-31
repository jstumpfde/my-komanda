// PATCH  /api/modules/ai-rop/connectors/[id] — вкл/выкл, переименовать.
// DELETE /api/modules/ai-rop/connectors/[id] — удалить канал (сообщения в
//   rop_messages остаются — connectorId ON DELETE CASCADE в схеме удалит их
//   вместе с коннектором; это осознанное поведение, канал = источник данных).
//
// Всегда фильтруем по companyId — обязательная изоляция тенанта (см. скилл
// tenant-isolation-check).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { isEnabled?: boolean; title?: string }

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.isEnabled === "boolean") patch.isEnabled = body.isEnabled
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim()

    const [row] = await db
      .update(ropChannelConnectors)
      .set(patch)
      .where(and(eq(ropChannelConnectors.id, id), eq(ropChannelConnectors.companyId, user.companyId)))
      .returning({ id: ropChannelConnectors.id })

    if (!row) return apiError("Канал не найден", 404)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[salesradar/connectors/:id] PATCH error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params

    const [row] = await db
      .delete(ropChannelConnectors)
      .where(and(eq(ropChannelConnectors.id, id), eq(ropChannelConnectors.companyId, user.companyId)))
      .returning({ id: ropChannelConnectors.id })

    if (!row) return apiError("Канал не найден", 404)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[salesradar/connectors/:id] DELETE error:", err)
    return apiError("Internal server error", 500)
  }
}
