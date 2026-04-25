import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { is_focus_today?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Неверный JSON" }, { status: 400 }) }

  const flag = body.is_focus_today === true

  const [existing] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, session.user.id)))
    .limit(1)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [updated] = await db
    .update(goals)
    .set({ isFocusToday: flag, updatedAt: new Date() })
    .where(eq(goals.id, id))
    .returning()

  return NextResponse.json(updated)
}
