// Резерв → Кампании: пауза/возобновление (PATCH) и удаление (DELETE).
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentCampaigns } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { status?: string }
    const status = body.status === "paused" ? "paused" : body.status === "active" ? "active" : null
    if (!status) return NextResponse.json({ error: "bad status" }, { status: 400 })
    const [row] = await db.update(talentCampaigns)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(talentCampaigns.id, id), eq(talentCampaigns.companyId, user.companyId)))
      .returning()
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ campaign: row })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    const [row] = await db.delete(talentCampaigns)
      .where(and(eq(talentCampaigns.id, id), eq(talentCampaigns.companyId, user.companyId)))
      .returning({ id: talentCampaigns.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
