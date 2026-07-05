import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { courses, courseEnrollments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAcademyAccess } from "@/lib/academy/access"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAcademyAccess()
    const { id: courseId } = await params
    await req.json().catch(() => ({}))
    // Запись — только за себя (guard-находка 05.07: произвольный body.employeeId
    // позволял записывать/проходить курс за другого; запись HR-ом за сотрудника
    // добавим отдельной осознанной фичей с проверкой компании).
    const employeeId: string = user.id || ""

    if (!employeeId) return apiError("Не удалось определить пользователя", 400)

    const [course] = await db.select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.tenantId, user.companyId)))

    if (!course) return apiError("Курс не найден", 404)

    const existing = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.employeeId, employeeId)))

    if (existing.length > 0) return apiSuccess({ alreadyEnrolled: true, id: existing[0].id })

    const [enrollment] = await db.insert(courseEnrollments).values({
      courseId,
      employeeId,
      status: "enrolled",
    }).returning()

    return apiSuccess(enrollment, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id]/enroll POST]", err)
    return apiError("Internal server error", 500)
  }
}
