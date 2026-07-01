import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, type VacancyRequirements } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scoreCandidateV2 } from "@/lib/ai-score-candidate-v2"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const body = await req.json() as { candidateId: string }
    if (!body.candidateId) {
      return apiError("candidateId обязательно", 400)
    }

    // Гарантия владения вакансией перед скорингом + проверка наличия
    // структурированных требований (требуются для Портрета v2).
    const [vacancy] = await db
      .select({
        id:               vacancies.id,
        requirementsJson: vacancies.requirementsJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    const reqJson = (vacancy.requirementsJson ?? {}) as VacancyRequirements
    const hasRequirements = (reqJson.must_have?.length ?? 0) > 0

    if (!hasRequirements) {
      // Без критериев Портрета оценивать нечем (legacy AI-оценка v1 удалена).
      return apiError("Для AI-скоринга заполните критерии Портрета вакансии", 400)
    }

    const v2Result = await scoreCandidateV2({
      candidateId: body.candidateId,
      vacancyId,
      skipIfScored: false,
    })

    if (!v2Result) {
      return apiError("Не удалось получить результат AI-скоринга", 500)
    }

    await db
      .update(candidates)
      .set({
        aiScore:          v2Result.score,
        aiScoreV2:        v2Result.score,
        aiScoreV2Details: v2Result,
        aiScoredAt:       new Date(),
        updatedAt:        new Date(),
      })
      .where(eq(candidates.id, body.candidateId))

    return apiSuccess({
      candidateId: body.candidateId,
      v2:          v2Result.score,
      // v2Details — полный CandidateScoreV2 (extracted_facts, criteria_scores,
      // reasoning, must_have stats).
      v2Details:   v2Result,
      // score — главный балл (= v2) для UI, не использующего v2 напрямую.
      score:       v2Result.score,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("AI scoring error:", err)
    return apiError(
      err instanceof Error ? err.message : "Ошибка AI-скоринга",
      500,
    )
  }
}
