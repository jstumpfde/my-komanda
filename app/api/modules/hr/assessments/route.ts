import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { assessments, skills, skillAssessments } from "@/lib/db/schema"
import { eq, and, desc, or, isNull } from "drizzle-orm"

export async function GET(req: NextRequest) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get("employeeId")
  const status = searchParams.get("status")
  const type = searchParams.get("type")

  const conditions = [eq(assessments.tenantId, user.companyId)]
  if (employeeId) conditions.push(eq(assessments.employeeId, employeeId))
  if (status) conditions.push(eq(assessments.status, status))
  if (type) conditions.push(eq(assessments.type, type))

  const rows = await db
    .select()
    .from(assessments)
    .where(and(...conditions))
    .orderBy(desc(assessments.createdAt))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const body = await req.json()
  const { employeeId, type, period, skillIds } = body

  if (!employeeId) return NextResponse.json({ error: "employeeId обязателен" }, { status: 400 })

  const [assessment] = await db.insert(assessments).values({
    tenantId: user.companyId,
    employeeId,
    type: type || "self",
    status: "draft",
    period: period || null,
    createdBy: (user as { id?: string }).id || null,
  }).returning()

  // Добавить навыки в оценку если переданы
  if (skillIds?.length) {
    await db.insert(skillAssessments).values(
      skillIds.map((skillId: string) => ({
        assessmentId: assessment.id,
        skillId,
        assessorId: (user as { id?: string }).id || employeeId,
      }))
    )
  } else {
    // По умолчанию добавляем все системные и тенантские навыки
    const allSkills = await db
      .select({ id: skills.id })
      .from(skills)
      .where(or(isNull(skills.tenantId), eq(skills.tenantId, user.companyId)))

    if (allSkills.length > 0) {
      await db.insert(skillAssessments).values(
        allSkills.map(s => ({
          assessmentId: assessment.id,
          skillId: s.id,
          assessorId: (user as { id?: string }).id || employeeId,
        }))
      )
    }
  }

  return NextResponse.json(assessment, { status: 201 })
}
