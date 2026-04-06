import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { tasks } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"

export async function GET() {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const allTasks = await db.select().from(tasks).where(eq(tasks.tenantId, user.companyId))

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const total = allTasks.length
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length
  const overdue = allTasks.filter((t) => t.deadline && new Date(t.deadline) < now && t.status !== "done" && t.status !== "cancelled").length
  const completedThisWeek = allTasks.filter((t) => t.completedAt && new Date(t.completedAt) >= weekAgo).length

  return NextResponse.json({ total, inProgress, overdue, completedThisWeek })
}
