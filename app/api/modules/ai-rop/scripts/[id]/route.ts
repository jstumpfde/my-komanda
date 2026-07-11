// PATCH /api/modules/ai-rop/scripts/[id] — обновить скрипт продаж.
// DELETE — удалить. Доступ: requireRopManage (директор). Оба скоуплены по companyId.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSalesScripts, type NewRopSalesScript } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import type { ChecklistItem } from "@/lib/ai-rop/types"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      product?: string | null
      direction?: "in" | "out" | "all"
      content_md?: string
      checklist?: ChecklistItem[]
      key_phrases?: string | null
      is_active?: boolean
    }

    const patch: Partial<NewRopSalesScript> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.product !== undefined) patch.product = body.product?.trim() || null
    if (body.direction !== undefined) patch.direction = body.direction
    if (body.content_md !== undefined) patch.contentMd = body.content_md
    if (body.checklist !== undefined) patch.checklistJson = body.checklist
    if (body.key_phrases !== undefined) patch.keyPhrases = (body.key_phrases ?? "").trim() || null
    if (body.is_active !== undefined) patch.isActive = !!body.is_active

    if (Object.keys(patch).length === 0) return apiError("Нечего обновлять", 400)
    patch.updatedAt = new Date()

    const updated = await db
      .update(ropSalesScripts)
      .set(patch)
      .where(and(eq(ropSalesScripts.id, id), eq(ropSalesScripts.tenantId, user.companyId)))
      .returning({ id: ropSalesScripts.id })
    if (updated.length === 0) return apiError("Скрипт не найден", 404)

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts/:id] PATCH error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopManage()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    await db.delete(ropSalesScripts).where(and(eq(ropSalesScripts.id, id), eq(ropSalesScripts.tenantId, user.companyId)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/scripts/:id] DELETE error:", err)
    return apiError("Internal server error", 500)
  }
}
