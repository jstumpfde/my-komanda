import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, and, max } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAcademyAccess } from "@/lib/academy/access"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAcademyAccess()
    const { id: courseId } = await params

    const [course] = await db.select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.tenantId, user.companyId)))

    if (!course) return apiError("Курс не найден", 404)

    const body = await req.json()

    const [maxOrder] = await db.select({ val: max(lessons.sortOrder) })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))

    const [lesson] = await db.insert(lessons).values({
      courseId,
      title: body.title || "Новый урок",
      type: body.type || "content",
      content: body.content || null,
      durationMin: body.durationMin || null,
      isRequired: body.isRequired ?? true,
      sortOrder: (maxOrder?.val ?? -1) + 1,
    }).returning()

    return apiSuccess(lesson, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id]/lessons POST]", err)
    return apiError("Internal server error", 500)
  }
}
