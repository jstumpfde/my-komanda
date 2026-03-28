import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { assessments, skillAssessments, courses } from "@/lib/db/schema"
import { eq, and, desc, or, isNull } from "drizzle-orm"
import { getRecommendations } from "@/lib/learning/ai-recommendations"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: employeeId } = await params

  // Last completed assessment
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

  const gaps: { skillId: string; skillName: string; skillCategory: string; gap: number }[] = []

  if (lastAssessment) {
    const scores = await db
      .select({
        skillId: skillAssessments.skillId,
        score: skillAssessments.score,
      })
      .from(skillAssessments)
      .where(eq(skillAssessments.assessmentId, lastAssessment.id))

    for (const s of scores) {
      if (s.score !== null && s.score < 4) {
        // Consider anything below 4 as a development area
        gaps.push({ skillId: s.skillId, skillName: "", skillCategory: "", gap: 4 - s.score })
      }
    }
  }

  // Available published courses
  const availableCourses = await db
    .select({ id: courses.id, title: courses.title, category: courses.category, difficulty: courses.difficulty })
    .from(courses)
    .where(and(eq(courses.tenantId, user.companyId), eq(courses.isPublished, true)))

  const recommendations = getRecommendations(gaps, availableCourses)

  return NextResponse.json({ employeeId, recommendations })
}
