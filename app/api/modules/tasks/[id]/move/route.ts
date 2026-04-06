import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { tasks, taskActivityLog } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const { status } = await req.json()

  if (!status) return NextResponse.json({ error: "status обязателен" }, { status: 400 })

  const [old] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, user.companyId)))
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, unknown> = { status, updatedAt: new Date() }
  if (status === "done") updates.completedAt = new Date()
  if (status === "in_progress" && !old.startedAt) updates.startedAt = new Date()

  const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning()

  await db.insert(taskActivityLog).values({
    taskId: id,
    userId: (user as { id?: string }).id || null,
    action: "status_changed",
    oldValue: old.status,
    newValue: status,
  })

  return NextResponse.json(task)
}
