import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { aiCourseProjects } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [project] = await db
    .select()
    .from(aiCourseProjects)
    .where(and(eq(aiCourseProjects.id, id), eq(aiCourseProjects.tenantId, user.companyId)))

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const body = await req.json()

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.sources !== undefined) updates.sources = body.sources
  if (body.params !== undefined) updates.params = body.params
  if (body.status !== undefined) updates.status = body.status
  if (body.result !== undefined) updates.result = body.result

  const [project] = await db
    .update(aiCourseProjects)
    .set(updates)
    .where(and(eq(aiCourseProjects.id, id), eq(aiCourseProjects.tenantId, user.companyId)))
    .returning()

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [deleted] = await db
    .delete(aiCourseProjects)
    .where(and(eq(aiCourseProjects.id, id), eq(aiCourseProjects.tenantId, user.companyId)))
    .returning()

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
