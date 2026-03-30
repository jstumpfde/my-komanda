/**
 * POST /api/modules/hr/courses-v2/[id]/enroll
 * Записаться на курс (создаёт enrollment для текущего пользователя).
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { courses, courseEnrollments } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId, userId } = await requireCompany()
    const { id } = await params

    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, id), eq(courses.tenantId, companyId)))
      .limit(1)

    if (!course) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

    const [enrollment] = await db
      .insert(courseEnrollments)
      .values({
        courseId: id,
        employeeId: userId,
        status: "enrolled",
        completionPct: 0,
      })
      .onConflictDoUpdate({
        target: [courseEnrollments.courseId, courseEnrollments.employeeId],
        set: { status: "enrolled" },
      })
      .returning()

    return NextResponse.json(enrollment)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
