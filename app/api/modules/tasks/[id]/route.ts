import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { tasks, taskComments, taskActivityLog } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [task] = await db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, user.companyId)))
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const comments = await db.select().from(taskComments).where(eq(taskComments.taskId, id)).orderBy(desc(taskComments.createdAt))
  const activity = await db.select().from(taskActivityLog).where(eq(taskActivityLog.taskId, id)).orderBy(desc(taskActivityLog.createdAt))
  const subtasks = await db.select().from(tasks).where(and(eq(tasks.parentId, id), eq(tasks.tenantId, user.companyId)))

  return NextResponse.json({ ...task, comments, activity, subtasks })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const body = await req.json()

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of ["title", "description", "status", "priority", "assigneeId", "projectId", "deadline", "tags", "progress", "estimatedHours", "actualHours", "sortOrder"]) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (body.status === "done" && !body.completedAt) updates.completedAt = new Date()
  if (body.status === "in_progress" && !body.startedAt) updates.startedAt = new Date()

  const [task] = await db.update(tasks).set(updates)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, user.companyId)))
    .returning()

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(task)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [deleted] = await db.delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, user.companyId)))
    .returning()

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
