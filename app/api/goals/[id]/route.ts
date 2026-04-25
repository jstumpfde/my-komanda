import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"

const VALID_LEVELS = ["yearly", "monthly", "weekly"] as const
const VALID_STATUSES = ["active", "completed", "paused", "archived"] as const

async function requireOwner(userId: string, goalId: string) {
  const [row] = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId))).limit(1)
  return row ?? null
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const row = await requireOwner(session.user.id, id)
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const existing = await requireOwner(session.user.id, id)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Неверный JSON" }, { status: 400 }) }

  const toNumStr = (v: unknown): string | null => {
    if (v === undefined || v === null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return null
    return String(n)
  }

  const patch: Partial<typeof goals.$inferInsert> = {}
  if (typeof body.title === "string") patch.title = body.title.trim()
  if ("description" in body) patch.description = typeof body.description === "string" ? body.description : null
  if ("target_value" in body) patch.targetValue = toNumStr(body.target_value)
  if ("target_unit" in body) patch.targetUnit = typeof body.target_unit === "string" && body.target_unit.trim() ? body.target_unit.trim() : null
  if ("current_value" in body) patch.currentValue = toNumStr(body.current_value) ?? "0"
  if ("deadline" in body) patch.deadline = typeof body.deadline === "string" && body.deadline.length > 0 ? body.deadline : null
  if ("is_focus_today" in body) patch.isFocusToday = body.is_focus_today === true
  if (typeof body.level === "string" && (VALID_LEVELS as readonly string[]).includes(body.level)) patch.level = body.level
  if (typeof body.status === "string" && (VALID_STATUSES as readonly string[]).includes(body.status)) patch.status = body.status
  if ("parent_id" in body) {
    const pid = typeof body.parent_id === "string" && body.parent_id.length > 0 ? body.parent_id : null
    if (pid) {
      const [parent] = await db.select({ userId: goals.userId }).from(goals).where(eq(goals.id, pid)).limit(1)
      if (!parent || parent.userId !== session.user.id) {
        return NextResponse.json({ error: "Родительская цель не найдена" }, { status: 400 })
      }
      if (pid === id) return NextResponse.json({ error: "Цель не может быть родителем самой себе" }, { status: 400 })
    }
    patch.parentId = pid
  }

  patch.updatedAt = new Date()

  const [updated] = await db.update(goals).set(patch).where(eq(goals.id, id)).returning()
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const existing = await requireOwner(session.user.id, id)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.delete(goals).where(eq(goals.id, id))
  return NextResponse.json({ ok: true })
}
