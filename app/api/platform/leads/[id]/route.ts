// PATCH /api/platform/leads/[id] — смена статуса заявки (new/contacted/closed).
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { landingLeads } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

const STATUSES = new Set(["new", "contacted", "closed"])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await ctx.params
  try {
    const body = (await req.json().catch(() => ({}))) as { status?: unknown }
    const status = typeof body.status === "string" ? body.status : ""
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "bad status" }, { status: 400 })
    }
    const [row] = await db.update(landingLeads).set({ status }).where(eq(landingLeads.id, id)).returning({ id: landingLeads.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[platform/leads/:id PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
