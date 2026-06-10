import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
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

    // Один запрос с JOIN — сразу проверяет tenant-принадлежность (companyId).
    const rows = await db
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
        descriptionJson: vacancies.descriptionJson,
      })
      .from(candidates)
      .innerJoin(vacancies, and(
        eq(candidates.vacancyId, vacancies.id),
        eq(vacancies.companyId, user.companyId),
      ))
      .where(eq(candidates.id, id))
      .limit(1)

    const cand = rows[0]
    if (!cand) return apiError("Не найдено", 404)

    const vac = { descriptionJson: cand.descriptionJson }

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
