import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

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
      sortOrder: courses.sortOrder,
      createdAt: courses.createdAt,
      lessonsCount: sql<number>`(select count(*) from lessons where course_id = ${courses.id})`,
    })
    .from(courses)
    .where(eq(courses.tenantId, user.companyId))
    .orderBy(desc(courses.createdAt))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const body = await req.json()
  const { title, description, category, difficulty, durationMin, isRequired, requiredFor } = body

  if (!title?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 })

  const [course] = await db.insert(courses).values({
    tenantId: user.companyId,
    title: title.trim(),
    description: description || null,
    category: category || "custom",
    difficulty: difficulty || "beginner",
    durationMin: durationMin || null,
    isRequired: isRequired || false,
    requiredFor: requiredFor || null,
    createdBy: (user as { id?: string }).id || null,
  }).returning()

  return NextResponse.json(course, { status: 201 })
}
