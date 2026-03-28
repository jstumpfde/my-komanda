import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, courseEnrollments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: courseId } = await params
  const body = await req.json()
  const employeeId: string = body.employeeId || (user as { id?: string }).id || ""

  if (!employeeId) return NextResponse.json({ error: "employeeId обязателен" }, { status: 400 })

  const [course] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.tenantId, user.companyId)))

  if (!course) return NextResponse.json({ error: "Курс не найден" }, { status: 404 })

  // upsert enrollment
  const existing = await db.select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.employeeId, employeeId)))

  if (existing.length > 0) return NextResponse.json({ alreadyEnrolled: true, id: existing[0].id })

  const [enrollment] = await db.insert(courseEnrollments).values({
    courseId,
    employeeId,
    status: "enrolled",
  }).returning()

  return NextResponse.json(enrollment, { status: 201 })
}
