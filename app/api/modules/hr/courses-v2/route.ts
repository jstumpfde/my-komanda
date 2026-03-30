/**
 * GET  /api/modules/hr/courses-v2  — каталог курсов
 * POST /api/modules/hr/courses-v2  — создать курс
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, desc, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { companyId } = await requireCompany()

    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        category: courses.category,
        difficulty: courses.difficulty,
        durationMin: courses.durationMin,
        isPublished: courses.isPublished,
        isRequired: courses.isRequired,
        createdAt: courses.createdAt,
      })
      .from(courses)
      .where(eq(courses.tenantId, companyId))
      .orderBy(desc(courses.createdAt))

    const withCounts = await Promise.all(
      rows.map(async (course) => {
        const [{ lessonsCount }] = await db
          .select({ lessonsCount: count() })
          .from(lessons)
          .where(eq(lessons.courseId, course.id))
        return { ...course, lessonsCount }
      })
    )

    return NextResponse.json(withCounts)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, userId } = await requireCompany()
    const body = await req.json()
    const { title, description, category = "custom", difficulty = "beginner", durationMin } = body

    if (!title) return NextResponse.json({ error: "title обязателен" }, { status: 400 })

    const [course] = await db
      .insert(courses)
      .values({
        tenantId: companyId,
        createdBy: userId,
        title,
        description,
        category,
        difficulty,
        durationMin: durationMin ?? null,
      })
      .returning()

    return NextResponse.json(course, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
