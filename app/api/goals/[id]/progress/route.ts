import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { current_value?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Неверный JSON" }, { status: 400 }) }

  const raw = body.current_value
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "current_value должен быть неотрицательным числом" }, { status: 400 })
  }

  const [existing] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, session.user.id)))
    .limit(1)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let nextStatus = existing.status
  if (existing.targetValue != null) {
    const target = Number(existing.targetValue)
    if (Number.isFinite(target) && target > 0 && n >= target) nextStatus = "completed"
    else if (nextStatus === "completed") nextStatus = "active" // вернулись ниже цели
  }

  const [updated] = await db
    .update(goals)
    .set({ currentValue: String(n), status: nextStatus, updatedAt: new Date() })
    .where(eq(goals.id, id))
    .returning()

  return NextResponse.json(updated)
}
