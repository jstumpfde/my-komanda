import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { taskProjects } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export async function GET() {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const projects = await db.select().from(taskProjects)
    .where(eq(taskProjects.tenantId, user.companyId))
    .orderBy(desc(taskProjects.createdAt))

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const body = await req.json()

  if (!body.title?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 })

  const [project] = await db.insert(taskProjects).values({
    tenantId: user.companyId,
    title: body.title.trim(),
    description: body.description || null,
    color: body.color || "#378ADD",
    icon: body.icon || null,
    deadline: body.deadline ? new Date(body.deadline) : null,
    ownerId: body.ownerId || (user as { id?: string }).id || null,
  }).returning()

  return NextResponse.json(project, { status: 201 })
}
