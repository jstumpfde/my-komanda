import { NextRequest } from "next/server"
import { and, eq, isNull, or, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scoreResumeRubric } from "@/lib/scoring/rubric"
import { buildSpecFromAnketa, buildResumeText } from "@/lib/scoring/vacancy-spec"

const MAX_PER_RUN = 50

// POST /api/modules/hr/vacancies/[id]/rubric-score-all?force=1
// Shadow-батч: считает рубричный балл для кандидатов вакансии (по умолчанию —
// только ещё не оценённых). Лимит 50 за вызов (контроль стоимости). Спецификация
// одна на вакансию → кэшируется (prompt cache). НЕ влияет на стадию/автодействия.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const force = req.nextUrl.searchParams.get("force") === "1"

    const [vac] = await db
      .select({ descriptionJson: vacancies.descriptionJson, companyId: vacancies.companyId })
      .from(vacancies).where(eq(vacancies.id, id)).limit(1)
    if (!vac || vac.companyId !== user.companyId) return apiError("Вакансия не найдена", 404)

    const anketa = (vac.descriptionJson as Record<string, unknown> | null)?.anketa as Record<string, unknown> | undefined
    const spec = buildSpecFromAnketa(anketa)

    // Кандидаты вакансии: есть что оценивать (ответы анкеты или навыки),
    // по умолчанию — только без rubric_score.
    const rows = await db
      .select({
        id: candidates.id, name: candidates.name, city: candidates.city,
        salaryMin: candidates.salaryMin, experienceYears: candidates.experienceYears,
        keySkills: candidates.keySkills, educationLevel: candidates.educationLevel,
        workFormat: candidates.workFormat, anketaAnswers: candidates.anketaAnswers,
        rubricScore: candidates.rubricScore,
      })
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, id),
        force ? undefined : isNull(candidates.rubricScore),
        or(isNotNull(candidates.anketaAnswers), isNotNull(candidates.keySkills)),
      ))
      .limit(MAX_PER_RUN + 1)

    const hasMore = rows.length > MAX_PER_RUN
    const batch = rows.slice(0, MAX_PER_RUN)

    const ranked: Array<{ id: string; name: string | null; total: number; verdict: string }> = []
    for (const c of batch) {
      try {
        const result = await scoreResumeRubric(spec, buildResumeText(c))
        await db.update(candidates)
          .set({ rubricScore: result.total, rubricDetails: result, rubricScoredAt: new Date() })
          .where(eq(candidates.id, c.id))
        ranked.push({ id: c.id, name: c.name, total: result.total, verdict: result.verdict })
      } catch { /* пропускаем сбойного кандидата */ }
    }

    ranked.sort((a, b) => b.total - a.total)
    return apiSuccess({ scored: ranked.length, hasMore, ranked })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError(err instanceof Error ? err.message : "Ошибка батч-скоринга", 500)
  }
}
