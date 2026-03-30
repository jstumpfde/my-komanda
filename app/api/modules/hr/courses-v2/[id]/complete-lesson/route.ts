/**
 * POST /api/modules/hr/courses-v2/[id]/complete-lesson
 * Отметить урок пройденным. При 100% — выдать сертификат.
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { courses, lessons, courseEnrollments, lessonCompletions, certificates } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId, id: userId } = await requireCompany()
    const { id: courseId } = await params
    const { lessonId, answer } = await req.json()

    if (!lessonId) return NextResponse.json({ error: "lessonId обязателен" }, { status: 400 })

    // Найти или создать enrollment
    const [enrollment] = await db
      .select()
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.employeeId, userId)))
      .limit(1)

    if (!enrollment) return NextResponse.json({ error: "Сначала запишитесь на курс" }, { status: 400 })

    // Отметить урок
    await db
      .insert(lessonCompletions)
      .values({
        enrollmentId: enrollment.id,
        lessonId,
        status: "completed",
        completedAt: new Date(),
        answer: answer ?? null,
      })
      .onConflictDoUpdate({
        target: [lessonCompletions.enrollmentId, lessonCompletions.lessonId],
        set: { status: "completed", completedAt: new Date() },
      })

    // Пересчитываем прогресс
    const [{ totalLessons }] = await db
      .select({ totalLessons: count() })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))

    const [{ completedLessons }] = await db
      .select({ completedLessons: count() })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.enrollmentId, enrollment.id), eq(lessonCompletions.status, "completed")))

    const completionPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
    const isCompleted = completionPct === 100

    await db
      .update(courseEnrollments)
      .set({
        completionPct,
        status: isCompleted ? "completed" : completedLessons > 0 ? "in_progress" : "enrolled",
        completedAt: isCompleted ? new Date() : null,
        lastAccessAt: new Date(),
      })
      .where(eq(courseEnrollments.id, enrollment.id))

    // Сертификат при 100%
    let certificate = null
    if (isCompleted) {
      const number = `MK-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000) + 10000}`
      const [existing] = await db
        .select()
        .from(certificates)
        .where(and(eq(certificates.courseId, courseId), eq(certificates.employeeId, userId)))
        .limit(1)

      if (!existing) {
        [certificate] = await db
          .insert(certificates)
          .values({ courseId, employeeId: userId, number })
          .returning()
      } else {
        certificate = existing
      }
    }

    return NextResponse.json({ completionPct, isCompleted, certificate })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
