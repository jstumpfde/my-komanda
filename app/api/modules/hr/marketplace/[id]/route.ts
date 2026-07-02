import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { projectApplications, internalProjects } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

// GET /api/modules/hr/marketplace/[id] — project with applications
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [project] = await db.select().from(internalProjects)
    .where(and(eq(internalProjects.id, id), eq(internalProjects.tenantId, session.user.companyId)))
    .limit(1)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const applications = await db.select().from(projectApplications)
    .where(eq(projectApplications.projectId, id))
    .orderBy(desc(projectApplications.matchScore))

  return NextResponse.json({ project, applications })
}

// POST /api/modules/hr/marketplace/[id] — apply or manage applications
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Проект должен принадлежать компании сессии — иначе 404 (не палим существование).
  const [project] = await db.select().from(internalProjects)
    .where(and(eq(internalProjects.id, id), eq(internalProjects.tenantId, session.user.companyId)))
    .limit(1)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.action === "apply") {
    const [app] = await db.insert(projectApplications).values({
      projectId:    id,
      employeeId:   body.employeeId || session.user.id,
      employeeName: body.employeeName || session.user.name,
      department:   body.department,
      motivation:   body.motivation,
      matchScore:   body.matchScore || null,
    }).returning()
    return NextResponse.json(app, { status: 201 })
  }

  if (body.action === "accept" || body.action === "reject") {
    // Заявка должна относиться к проекту этой компании (projectId = id уже провалидирован выше).
    const [updated] = await db.update(projectApplications)
      .set({ status: body.action === "accept" ? "accepted" : "rejected", resolvedAt: new Date() })
      .where(and(eq(projectApplications.id, body.applicationId), eq(projectApplications.projectId, id)))
      .returning()
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
