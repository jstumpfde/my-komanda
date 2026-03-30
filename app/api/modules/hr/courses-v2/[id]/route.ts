/**
 * GET    /api/modules/hr/courses-v2/[id]  — курс + уроки
 * PUT    /api/modules/hr/courses-v2/[id]  — обновить / добавить урок
 * DELETE /api/modules/hr/courses-v2/[id]  — удалить
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

async function getCourse(companyId: string, id: string) {
  const [c] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, companyId)))
    .limit(1)
  return c ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const course = await getCourse(companyId, id)
    if (!course) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const lessonRows = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, id))
      .orderBy(asc(lessons.sortOrder))

    return NextResponse.json({ ...course, lessons: lessonRows })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const course = await getCourse(companyId, id)
    if (!course) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const body = await req.json()
    const action = req.nextUrl.searchParams.get("action")

    // Добавить урок
    if (action === "addLesson") {
      const { title, type = "content", content } = body
      const existing = await db.select({ s: lessons.sortOrder }).from(lessons).where(eq(lessons.courseId, id))
      const maxSort = existing.reduce((m, r) => Math.max(m, r.s ?? 0), 0)
      const [lesson] = await db
        .insert(lessons)
        .values({ courseId: id, title: title ?? "Новый урок", type, content, sortOrder: maxSort + 1 })
        .returning()
      return NextResponse.json(lesson, { status: 201 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() }
    if ("title" in body) update.title = body.title
    if ("description" in body) update.description = body.description
    if ("isPublished" in body) update.isPublished = body.isPublished
    if ("difficulty" in body) update.difficulty = body.difficulty

    const [updated] = await db.update(courses).set(update).where(eq(courses.id, id)).returning()
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireCompany()
    const { id } = await params
    const course = await getCourse(companyId, id)
    if (!course) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
    await db.delete(courses).where(eq(courses.id, id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
