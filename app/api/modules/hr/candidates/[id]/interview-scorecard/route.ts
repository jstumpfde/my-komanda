// PATCH /api/modules/hr/candidates/[id]/interview-scorecard
//
// Скоркарта интервью (Company24, дизайн координатора, одобрен Юрием 05.07).
// Автосейв на каждый тап критерия ИЛИ на изменение ручного балла. Считает
// autoScore на сервере (не доверяем клиенту), пишет interview_score =
// manualOverride ?? autoScore. requireCompany + владение кандидатом (через
// вакансию компании, тот же приём, что и в notes/stage роутах).

import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  computeAutoScore,
  resolveInterviewScore,
  type InterviewScorecard,
  type ScorecardCriterion,
  type ScorecardVerdict,
} from "@/lib/candidates/interview-scorecard"

const VALID_VERDICTS: ReadonlySet<string> = new Set<ScorecardVerdict>(["confirmed", "not_confirmed", "not_checked"])
const VALID_SOURCES: ReadonlySet<string> = new Set(["portrait", "universal"])

function isValidCriterion(c: unknown): c is ScorecardCriterion {
  if (!c || typeof c !== "object") return false
  const o = c as Record<string, unknown>
  return (
    typeof o.key === "string" && o.key.length > 0 &&
    typeof o.label === "string" && o.label.length > 0 &&
    VALID_SOURCES.has(o.source as string) &&
    VALID_VERDICTS.has(o.verdict as string) &&
    (o.weight === 1 || o.weight === 2)
  )
}

async function getOwnedCandidate(candidateId: string, companyId: string) {
  const [row] = await db
    .select({ candidate: candidates })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)
  return row?.candidate ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const candidate = await getOwnedCandidate(id, user.companyId)
    if (!candidate) return apiError("Candidate not found", 404)

    const body = await req.json() as {
      criteria?: unknown
      manualOverride?: unknown
    }

    // criteria — обязателен на каждый автосейв (клиент шлёт полный актуальный
    // список после тапа). Если не пришёл — берём уже сохранённый (на случай
    // автосейва только ручного балла без изменения критериев).
    const existing = (candidate.interviewScorecardJson as InterviewScorecard | null) ?? null

    let criteria: ScorecardCriterion[]
    if (body.criteria !== undefined) {
      if (!Array.isArray(body.criteria) || !body.criteria.every(isValidCriterion)) {
        return apiError("Invalid criteria", 400)
      }
      criteria = body.criteria as ScorecardCriterion[]
    } else {
      criteria = existing?.criteria ?? []
    }

    let manualOverride: number | null
    if (body.manualOverride !== undefined) {
      if (body.manualOverride === null) {
        manualOverride = null
      } else if (
        typeof body.manualOverride === "number" &&
        Number.isInteger(body.manualOverride) &&
        body.manualOverride >= 1 && body.manualOverride <= 10
      ) {
        manualOverride = body.manualOverride
      } else {
        return apiError("manualOverride must be an integer 1-10 or null", 400)
      }
    } else {
      manualOverride = existing?.manualOverride ?? null
    }

    const autoScore = computeAutoScore(criteria)

    const scorecard: InterviewScorecard = {
      criteria,
      autoScore,
      manualOverride,
      decidedBy: user.id,
      decidedAt: new Date().toISOString(),
    }

    const interviewScore = resolveInterviewScore(scorecard)

    const [updated] = await db
      .update(candidates)
      .set({
        interviewScorecardJson: scorecard,
        interviewScore,
        updatedAt: new Date(),
      })
      // TOCTOU-защита: UPDATE сам скоупим по компании (см. notes/stage роуты).
      .where(and(
        eq(candidates.id, id),
        inArray(
          candidates.vacancyId,
          db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.companyId, user.companyId)),
        ),
      ))
      .returning({ id: candidates.id, interviewScore: candidates.interviewScore, interviewScorecardJson: candidates.interviewScorecardJson })

    if (!updated) return apiError("Candidate not found", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
