import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, type VacancyRequirements } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scoreCandidateById } from "@/lib/ai-score-candidate"
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
    // структурированных требований (требуются для v2).
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

    if (hasRequirements) {
      // Группа 25: A/B — запускаем v1 и v2 параллельно. Каждый — со своей
      // обработкой ошибок. Если оба упали — ошибка. Если хотя бы один — ОК.
      const [v1Result, v2Result] = await Promise.all([
        scoreCandidateById({
          candidateId: body.candidateId,
          vacancyId,
          skipIfScored: false,
        }).catch((err: unknown) => {
          console.error("[score-v1] error", err)
          return null
        }),
        scoreCandidateV2({
          candidateId: body.candidateId,
          vacancyId,
          skipIfScored: false,
        }).catch((err: unknown) => {
          console.error("[score-v2] error", err)
          return null
        }),
      ])

      if (!v1Result && !v2Result) {
        return apiError("Не удалось получить результат AI-скоринга", 500)
      }

      // aiScore = v2 если есть, иначе v1 (он уже записан в БД самим v1).
      const mainScore = v2Result?.score ?? v1Result?.score ?? null
      await db
        .update(candidates)
        .set({
          aiScore:          mainScore,
          aiScoreV1:        v1Result?.score ?? null,
          aiScoreV2:        v2Result?.score ?? null,
          aiScoreV2Details: v2Result ?? null,
          aiScoredAt:       new Date(),
          updatedAt:        new Date(),
        })
        .where(eq(candidates.id, body.candidateId))

      return apiSuccess({
        candidateId: body.candidateId,
        v1:          v1Result?.score ?? null,
        v2:          v2Result?.score ?? null,
        // v2Details — полный CandidateScoreV2 (extracted_facts, criteria_scores,
        // reasoning, must_have stats). Передаём отдельным полем чтобы не
        // конфликтовать с legacy details (массив v1).
        v2Details:   v2Result ?? null,
        // Legacy-поля для совместимости с UI, не использующим v2 ещё.
        score:       mainScore,
        summary:     v1Result?.summary ?? null,
        details:     v1Result?.details ?? null,
      })
    }

    // Legacy: только v1.
    const v1Result = await scoreCandidateById({
      candidateId: body.candidateId,
      vacancyId,
      skipIfScored: false,
    })
    if (!v1Result) {
      return apiError("Не удалось получить результат", 500)
    }

    // scoreCandidateById обновляет aiScore сам — синхронизируем aiScoreV1 + aiScoredAt.
    await db
      .update(candidates)
      .set({
        aiScoreV1:  v1Result.score,
        aiScoredAt: new Date(),
        updatedAt:  new Date(),
      })
      .where(eq(candidates.id, body.candidateId))

    return apiSuccess({
      candidateId: body.candidateId,
      score:       v1Result.score,
      summary:     v1Result.summary,
      details:     v1Result.details,
      v1:          v1Result.score,
      v2:          null,
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
