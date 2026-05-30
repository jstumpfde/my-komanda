import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scoreResumeRubric } from "@/lib/scoring/rubric"
import { buildSpecFromAnketa, buildResumeText } from "@/lib/scoring/vacancy-spec"

// POST /api/modules/hr/candidates/[id]/rubric-score
// Shadow: считает рубричный балл соответствия кандидата вакансии и сохраняет
// в candidates.rubric_*. НЕ меняет stage/ai_score и никакие автодействия.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [cand] = await db
      .select({
        id: candidates.id,
        vacancyId: candidates.vacancyId,
        name: candidates.name,
        city: candidates.city,
        salaryMin: candidates.salaryMin,
        experienceYears: candidates.experienceYears,
        keySkills: candidates.keySkills,
        educationLevel: candidates.educationLevel,
        workFormat: candidates.workFormat,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(eq(candidates.id, id))
      .limit(1)

    if (!cand) return apiError("Кандидат не найден", 404)

    const [vac] = await db
      .select({ descriptionJson: vacancies.descriptionJson, companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, cand.vacancyId))
      .limit(1)

    if (!vac || vac.companyId !== user.companyId) return apiError("Не найдено", 404)

    const anketa = (vac.descriptionJson as Record<string, unknown> | null)?.anketa as Record<string, unknown> | undefined
    const spec = buildSpecFromAnketa(anketa)
    const resumeText = buildResumeText(cand)

    const result = await scoreResumeRubric(spec, resumeText)

    await db.update(candidates)
      .set({ rubricScore: result.total, rubricDetails: result, rubricScoredAt: new Date() })
      .where(eq(candidates.id, id))

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError(err instanceof Error ? err.message : "Ошибка скоринга", 500)
  }
}
