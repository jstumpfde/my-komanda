import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { tasks } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"

export async function GET(req: NextRequest) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const url = req.nextUrl.searchParams
  const where = [eq(tasks.tenantId, user.companyId)]

  const rows = await db.select().from(tasks)
    .where(and(...where))
    .orderBy(desc(tasks.createdAt))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const body = await req.json()
  if (!body.title?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 })

  const [task] = await db.insert(tasks).values({
    tenantId: user.companyId,
    projectId: body.projectId || null,
    parentId: body.parentId || null,
    title: body.title.trim(),
    description: body.description || null,
    status: body.status || "todo",
    priority: body.priority || "medium",
    assigneeId: body.assigneeId || null,
    creatorId: (user as { id?: string }).id || null,
    source: body.source || "manual",
    sourceId: body.sourceId || null,
    tags: body.tags || null,
    deadline: body.deadline ? new Date(body.deadline) : null,
    estimatedHours: body.estimatedHours || null,
    sortOrder: body.sortOrder ?? 0,
  }).returning()

  return NextResponse.json(task, { status: 201 })
}
