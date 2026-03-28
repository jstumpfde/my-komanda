import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { assessments, skillAssessments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id } = await params
  const body = await req.json()
  // body.scores: { skillId: string, score: number, comment?: string }[]

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.tenantId, user.companyId)))

  if (!assessment) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
  if (assessment.status === "completed") return NextResponse.json({ error: "Уже завершено" }, { status: 400 })

  if (body.scores?.length) {
    for (const s of body.scores as { skillId: string; score: number; comment?: string }[]) {
      await db
        .update(skillAssessments)
        .set({ score: s.score, comment: s.comment || null })
        .where(and(
          eq(skillAssessments.assessmentId, id),
          eq(skillAssessments.skillId, s.skillId),
        ))
    }
  }

  const [updated] = await db
    .update(assessments)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(assessments.id, id))
    .returning()

  return NextResponse.json(updated)
}
