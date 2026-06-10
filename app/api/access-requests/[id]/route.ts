import { NextRequest, NextResponse } from "next/server"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try { await requirePlatformOperator() } catch (e) { return e instanceof Response ? e : NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const { status } = await req.json()

  const [updated] = await db.update(accessRequests)
    .set({ status })
    .where(eq(accessRequests.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try { await requirePlatformOperator() } catch (e) { return e instanceof Response ? e : NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [deleted] = await db.delete(accessRequests).where(eq(accessRequests.id, id)).returning()
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
