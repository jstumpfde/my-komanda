import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { taskProjects } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [project] = await db.select().from(taskProjects)
    .where(and(eq(taskProjects.id, id), eq(taskProjects.tenantId, user.companyId)))

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const body = await req.json()

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of ["title", "description", "status", "color", "icon", "deadline", "progress"]) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  const [project] = await db.update(taskProjects).set(updates)
    .where(and(eq(taskProjects.id, id), eq(taskProjects.tenantId, user.companyId)))
    .returning()

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [project] = await db.update(taskProjects)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(taskProjects.id, id), eq(taskProjects.tenantId, user.companyId)))
    .returning()

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
