// Резерв → Формы: обновление (PUT) и удаление (DELETE) формы.
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentForms } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { cleanForm } from "@/lib/talent-pool-forms"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const row = cleanForm(body, user.companyId)
    if (!row.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const { companyId: _c, ...updates } = row
    void _c
    const [updated] = await db.update(talentForms)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(talentForms.id, id), eq(talentForms.companyId, user.companyId)))
      .returning()
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ form: updated })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db.delete(talentForms)
      .where(and(eq(talentForms.id, id), eq(talentForms.companyId, user.companyId)))
      .returning({ id: talentForms.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
