import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { assessments, skillAssessments, skills, positionSkills } from "@/lib/db/schema"
import { eq, and, desc, or, isNull } from "drizzle-orm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: employeeId } = await params
  const { searchParams } = new URL(req.url)
  const positionId = searchParams.get("positionId")

  // Last completed assessment for this employee
  const [lastAssessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(
      eq(assessments.tenantId, user.companyId),
      eq(assessments.employeeId, employeeId),
      eq(assessments.status, "completed"),
    ))
    .orderBy(desc(assessments.completedAt))
    .limit(1)

  // Current scores (latest assessment)
  const currentScores: Record<string, number> = {}
  if (lastAssessment) {
    const scores = await db
      .select({ skillId: skillAssessments.skillId, score: skillAssessments.score })
      .from(skillAssessments)
      .where(eq(skillAssessments.assessmentId, lastAssessment.id))

    for (const s of scores) {
      if (s.score !== null) currentScores[s.skillId] = s.score
    }
  }

  // All relevant skills
  const allSkills = await db
    .select()
    .from(skills)
    .where(or(isNull(skills.tenantId), eq(skills.tenantId, user.companyId)))

  // Required levels (by positionId if given)
  const requiredMap: Record<string, number> = {}
  if (positionId) {
    const reqs = await db
      .select({ skillId: positionSkills.skillId, requiredLevel: positionSkills.requiredLevel })
      .from(positionSkills)
      .where(eq(positionSkills.positionId, positionId))

    for (const r of reqs) requiredMap[r.skillId] = r.requiredLevel
  }

  const result = allSkills.map(skill => {
    const current = currentScores[skill.id] ?? null
    const required = requiredMap[skill.id] ?? null
    const gap = required !== null && current !== null ? required - current : null
    return {
      skillId: skill.id,
      skillName: skill.name,
      skillCategory: skill.category,
      currentScore: current,
      requiredScore: required,
      gap,
      hasData: current !== null,
    }
  })

  // Sort: biggest gap first
  result.sort((a, b) => {
    if (a.gap === null && b.gap === null) return 0
    if (a.gap === null) return 1
    if (b.gap === null) return -1
    return b.gap - a.gap
  })

  return NextResponse.json({ employeeId, positionId, lastAssessmentId: lastAssessment?.id ?? null, skills: result })
}
