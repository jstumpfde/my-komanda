// Резерв → «База»: жизненный цикл записи (архив/восстановить/корзина) + удалить навсегда.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentPoolEntries } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

// PATCH { action: "archive" | "restore" | "trash" | "untrash" }
//  archive — «Не подходит» → Архив · restore — обратно в активные ·
//  trash — Архив → Корзина · untrash — Корзина → Архив.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const { action } = (await req.json().catch(() => ({}))) as { action?: string }
    const now = new Date()
    const sets: Record<string, { archivedAt?: Date | null; trashedAt?: Date | null }> = {
      archive: { archivedAt: now, trashedAt: null },
      restore: { archivedAt: null, trashedAt: null },
      trash:   { trashedAt: now },
      untrash: { trashedAt: null },
    }
    const patch = sets[action ?? ""]
    if (!patch) return NextResponse.json({ error: "bad action" }, { status: 400 })
    const [row] = await db.update(talentPoolEntries).set(patch)
      .where(and(eq(talentPoolEntries.id, id), eq(talentPoolEntries.companyId, user.companyId)))
      .returning({ id: talentPoolEntries.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db.delete(talentPoolEntries)
      .where(and(eq(talentPoolEntries.id, id), eq(talentPoolEntries.companyId, user.companyId)))
      .returning({ id: talentPoolEntries.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
