// Резерв → «База»: удалить ручную запись (только своей компании).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentPoolEntries } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

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
