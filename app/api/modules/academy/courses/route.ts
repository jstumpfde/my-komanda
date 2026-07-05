import { NextRequest } from "next/server"
import { eq, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { courses } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAcademyAccess } from "@/lib/academy/access"

// «Академия продукта» — каталог курсов. Использует те же таблицы courses/
// lessons, что и app/api/modules/hr/courses/*, но доступ ограничен
// requireAcademyAccess (только владелец-полигон, см. lib/academy/access.ts).
export async function GET() {
  try {
    const user = await requireAcademyAccess()

    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        coverImage: courses.coverImage,
        category: courses.category,
        difficulty: courses.difficulty,
        durationMin: courses.durationMin,
        isPublished: courses.isPublished,
        isRequired: courses.isRequired,
        passingScorePercent: courses.passingScorePercent,
        sortOrder: courses.sortOrder,
        createdAt: courses.createdAt,
        lessonsCount: sql<number>`(select count(*) from "lessons" where "course_id" = "courses"."id")`,
      })
      .from(courses)
      .where(eq(courses.tenantId, user.companyId))
      .orderBy(courses.sortOrder, desc(courses.createdAt))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAcademyAccess()
    const body = await req.json()
    const { title, description, category, difficulty, durationMin, isRequired, requiredFor, passingScorePercent } = body

    if (!title?.trim()) return apiError("Название обязательно", 400)

    const [course] = await db.insert(courses).values({
      tenantId: user.companyId,
      title: title.trim(),
      description: description || null,
      category: category || "product",
      difficulty: difficulty || "beginner",
      durationMin: durationMin || null,
      isRequired: isRequired || false,
      requiredFor: requiredFor || null,
      passingScorePercent: typeof passingScorePercent === "number" ? passingScorePercent : null,
      createdBy: user.id || null,
    }).returning()

    return apiSuccess(course, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses POST]", err)
    return apiError("Internal server error", 500)
  }
}
