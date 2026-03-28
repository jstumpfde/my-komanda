import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { assessments, skillAssessments, skills, assessmentReviewers } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.tenantId, user.companyId)))

  if (!assessment) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  const scores = await db
    .select({
      id: skillAssessments.id,
      skillId: skillAssessments.skillId,
      score: skillAssessments.score,
      comment: skillAssessments.comment,
      assessorId: skillAssessments.assessorId,
      skillName: skills.name,
      skillCategory: skills.category,
    })
    .from(skillAssessments)
    .innerJoin(skills, eq(skillAssessments.skillId, skills.id))
    .where(eq(skillAssessments.assessmentId, id))

  const reviewers = await db
    .select()
    .from(assessmentReviewers)
    .where(eq(assessmentReviewers.assessmentId, id))

  return NextResponse.json({ ...assessment, scores, reviewers })
}
