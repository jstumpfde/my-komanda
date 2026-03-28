import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params
  const body = await req.json()

  // verify ownership via course
  const [lesson] = await db.select({ id: lessons.id, courseId: lessons.courseId })
    .from(lessons).where(eq(lessons.id, id))

  if (!lesson) return NextResponse.json({ error: "Урок не найден" }, { status: 404 })

  const [course] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, lesson.courseId), eq(courses.tenantId, user.companyId)))

  if (!course) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [updated] = await db.update(lessons).set({
    title: body.title,
    type: body.type,
    content: body.content,
    durationMin: body.durationMin,
    isRequired: body.isRequired,
    sortOrder: body.sortOrder,
  }).where(eq(lessons.id, id)).returning()

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params

  const [lesson] = await db.select({ id: lessons.id, courseId: lessons.courseId })
    .from(lessons).where(eq(lessons.id, id))

  if (!lesson) return NextResponse.json({ error: "Урок не найден" }, { status: 404 })

  const [course] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, lesson.courseId), eq(courses.tenantId, user.companyId)))

  if (!course) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await db.delete(lessons).where(eq(lessons.id, id))
  return NextResponse.json({ ok: true })
}
