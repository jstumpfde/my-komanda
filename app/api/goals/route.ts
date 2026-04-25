import { NextResponse } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"

const VALID_LEVELS = ["yearly", "monthly", "weekly"] as const
type Level = (typeof VALID_LEVELS)[number]
const VALID_STATUSES = ["active", "completed", "paused", "archived"] as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const level = url.searchParams.get("level")
  const status = url.searchParams.get("status") ?? "active"

  const conditions = [eq(goals.userId, session.user.id)]
  if (level && (VALID_LEVELS as readonly string[]).includes(level)) {
    conditions.push(eq(goals.level, level))
  }
  if (status !== "all" && (VALID_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(goals.status, status))
  }

  const rows = await db.select().from(goals).where(and(...conditions)).orderBy(desc(goals.createdAt))
  return NextResponse.json({ goals: rows })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 })
  }

  const level = body.level as Level | undefined
  const title = typeof body.title === "string" ? body.title.trim() : ""
  if (!title) {
    return NextResponse.json({ error: "title обязателен" }, { status: 400 })
  }
  if (!level || !(VALID_LEVELS as readonly string[]).includes(level)) {
    return NextResponse.json({ error: "level должен быть yearly/monthly/weekly" }, { status: 400 })
  }

  const parentId = typeof body.parent_id === "string" && body.parent_id.length > 0 ? body.parent_id : null

  if (parentId) {
    const [parent] = await db
      .select({ id: goals.id, userId: goals.userId })
      .from(goals)
      .where(eq(goals.id, parentId))
      .limit(1)
    if (!parent || parent.userId !== session.user.id) {
      return NextResponse.json({ error: "Родительская цель не найдена" }, { status: 400 })
    }
  }

  const toNumStr = (v: unknown): string | null => {
    if (v === undefined || v === null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return null
    return String(n)
  }

  const [created] = await db
    .insert(goals)
    .values({
      userId:       session.user.id,
      parentId,
      level,
      title,
      description:  typeof body.description === "string" ? body.description : null,
      targetValue:  toNumStr(body.target_value),
      targetUnit:   typeof body.target_unit === "string" && body.target_unit.trim() ? body.target_unit.trim() : null,
      currentValue: toNumStr(body.current_value) ?? "0",
      deadline:     typeof body.deadline === "string" && body.deadline.length > 0 ? body.deadline : null,
      isFocusToday: body.is_focus_today === true,
      status:       "active",
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
