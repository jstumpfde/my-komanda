import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scoreCandidateById } from "@/lib/ai-score-candidate"

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

    // Гарантия владения вакансией перед скорингом.
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    const result = await scoreCandidateById({
      candidateId: body.candidateId,
      vacancyId,
      // Ручной триггер из drawer — переоцениваем даже если уже есть оценка.
      skipIfScored: false,
    })

    if (!result) {
      return apiError("Не удалось получить результат", 500)
    }

    return apiSuccess({
      score: result.score,
      summary: result.summary,
      details: result.details,
      candidateId: body.candidateId,
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
