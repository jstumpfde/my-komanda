// Резерв → Формы: удалить tracking-ссылку.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { formTrackingLinks } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db.delete(formTrackingLinks)
      .where(and(eq(formTrackingLinks.id, id), eq(formTrackingLinks.companyId, user.companyId)))
      .returning({ id: formTrackingLinks.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
