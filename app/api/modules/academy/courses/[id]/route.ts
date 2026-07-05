import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAcademyAccess } from "@/lib/academy/access"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAcademyAccess()
    const { id } = await params

    const [course] = await db.select().from(courses)
      .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

    if (!course) return apiError("Не найдено", 404)

    const lessonList = await db.select().from(lessons)
      .where(eq(lessons.courseId, id))
      .orderBy(asc(lessons.sortOrder))

    return apiSuccess({ ...course, lessons: lessonList })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id] GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAcademyAccess()
    const { id } = await params
    const body = await req.json()

    const [existing] = await db.select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

    if (!existing) return apiError("Не найдено", 404)

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
        passingScorePercent: body.passingScorePercent,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id] PUT]", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAcademyAccess()
    const { id } = await params

    const [existing] = await db.select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, id), eq(courses.tenantId, user.companyId)))

    if (!existing) return apiError("Не найдено", 404)

    await db.delete(courses).where(eq(courses.id, id))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id] DELETE]", err)
    return apiError("Internal server error", 500)
  }
}
