import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, candidateQualificationAnswers, vacancies } from "@/lib/db/schema"
import { auth } from "@/auth"

// GET /api/modules/hr/candidates/[id]/qualification
//
// Возвращает {status, sentAt, completedAt, answers[]}. Используется в
// карточке кандидата (answers-tab.tsx) — раздел «Предквалификация».
// Изоляция по company через vacancies.company_id.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const [cand] = await db
    .select({
      id:           candidates.id,
      vacancyId:    candidates.vacancyId,
      status:       candidates.prequalificationStatus,
      sentAt:       candidates.prequalificationSentAt,
      completedAt:  candidates.prequalificationCompletedAt,
      companyId:    vacancies.companyId,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(eq(candidates.id, id))
    .limit(1)

  if (!cand || cand.companyId !== session.user.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const answers = await db
    .select({
      id:           candidateQualificationAnswers.id,
      questionText: candidateQualificationAnswers.questionText,
      answerText:   candidateQualificationAnswers.answerText,
      aiVerdict:    candidateQualificationAnswers.aiVerdict,
      aiReasoning:  candidateQualificationAnswers.aiReasoning,
      isCritical:   candidateQualificationAnswers.isCritical,
      createdAt:    candidateQualificationAnswers.createdAt,
    })
    .from(candidateQualificationAnswers)
    .where(and(
      eq(candidateQualificationAnswers.candidateId, id),
      eq(candidateQualificationAnswers.vacancyId, cand.vacancyId),
    ))
    .orderBy(candidateQualificationAnswers.createdAt)

  return NextResponse.json({
    status:      cand.status,
    sentAt:      cand.sentAt,
    completedAt: cand.completedAt,
    answers,
  })
}
