import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, and, max } from "drizzle-orm"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: courseId } = await params

  // verify ownership
  const [course] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.tenantId, user.companyId)))

  if (!course) return NextResponse.json({ error: "Курс не найден" }, { status: 404 })

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

  return NextResponse.json(lesson, { status: 201 })
}
