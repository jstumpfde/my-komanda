import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { aiCourseProjects } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export async function GET() {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const projects = await db
    .select()
    .from(aiCourseProjects)
    .where(eq(aiCourseProjects.tenantId, user.companyId))
    .orderBy(desc(aiCourseProjects.createdAt))

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const body = await req.json()
  const { title, description } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: "Название обязательно" }, { status: 400 })
  }

  const [project] = await db.insert(aiCourseProjects).values({
    tenantId: user.companyId,
    title: title.trim(),
    description: description?.trim() || null,
    createdBy: (user as { id?: string }).id || null,
  }).returning()

  return NextResponse.json(project, { status: 201 })
}
