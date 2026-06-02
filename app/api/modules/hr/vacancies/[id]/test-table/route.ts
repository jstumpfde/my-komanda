// GET /api/modules/hr/vacancies/[id]/test-table
// Таблица «кандидаты × вопросы теста» по всей вакансии (для режима «Вид → Тест»).
// Возвращает вопросы теста + всех активных кандидатов с их ответами/баллами.
import { and, eq, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { buildComparison } from "@/lib/compare/build-comparison"

const MAX_ROWS = 500

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params

    const [vac] = await db
      .select({ companyId: vacancies.companyId, title: vacancies.title })
      .from(vacancies).where(eq(vacancies.id, vacancyId)).limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    const rows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, vacancyId), isNull(candidates.deletedAt)))
      .orderBy(desc(candidates.createdAt))
      .limit(MAX_ROWS)
    const ids = rows.map((r) => r.id)
    if (ids.length === 0) return apiSuccess({ vacancyTitle: vac.title, questions: [], candidates: [] })

    const comp = await buildComparison(vacancyId, ids)
    // Только секция теста — она и нужна для этого режима.
    const testSection = comp.sections.find((s) => s.key === "test")
    const questions = testSection?.questions ?? []
    const answersBySection = testSection?.answers ?? {}

    // Кандидаты: ставим тех, у кого есть балл/ответы, выше; остальные ниже.
    const out = comp.candidates
      .map((c) => ({
        id: c.id,
        name: c.name,
        testScore: c.testScore,
        testPoints: c.testPoints,
        resumeScore: c.resumeScore,
        answers: answersBySection[c.id] ?? {},
      }))
      .sort((a, b) => (b.testScore ?? -1) - (a.testScore ?? -1))

    return apiSuccess({ vacancyTitle: vac.title, questions, candidates: out })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
