import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params

  const [course] = await db.select().from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

  if (!course) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  const lessonList = await db.select().from(lessons)
    .where(eq(lessons.courseId, id))
    .orderBy(asc(lessons.sortOrder))

  return NextResponse.json({ ...course, lessons: lessonList })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params
  const body = await req.json()

  const [existing] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  const [updated] = await db.update(courses)
    .set({
      title: body.title,
      description: body.description,
      category: body.category,
      difficulty: body.difficulty,
      durationMin: body.durationMin,
      isPublished: body.isPublished,
      isRequired: body.isRequired,
      requiredFor: body.requiredFor,
      coverImage: body.coverImage,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params

  const [existing] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  await db.delete(courses).where(eq(courses.id, id))

  return NextResponse.json({ ok: true })
}
