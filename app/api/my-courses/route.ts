import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, courseEnrollments, lessonCompletions, lessons } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const employeeId = (user as { id?: string }).id || ""

  const rows = await db
    .select({
      enrollmentId: courseEnrollments.id,
      status: courseEnrollments.status,
      completionPct: courseEnrollments.completionPct,
      enrolledAt: courseEnrollments.enrolledAt,
      completedAt: courseEnrollments.completedAt,
      lastAccessAt: courseEnrollments.lastAccessAt,
      courseId: courses.id,
      title: courses.title,
      description: courses.description,
      category: courses.category,
      difficulty: courses.difficulty,
      durationMin: courses.durationMin,
      coverImage: courses.coverImage,
      lessonsCount: sql<number>`(select count(*) from lessons where course_id = ${courses.id})`,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .where(
      and(
        eq(courseEnrollments.employeeId, employeeId),
        eq(courses.tenantId, user.companyId),
      )
    )

  return NextResponse.json(rows)
}
