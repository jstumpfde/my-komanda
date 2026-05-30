import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { and, eq, isNull, isNotNull, or } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { scoreResumeRubric } from "@/lib/scoring/rubric"
import { buildSpecFromAnketa, buildResumeText } from "@/lib/scoring/vacancy-spec"

// POST /api/cron/rubric-score — авто-скоринг рубрикой: считает неоценённых
// кандидатов (rubric_score IS NULL, есть ответы/навыки) на активных вакансиях.
// Порция за вызов ограничена (контроль стоимости), считает параллельно.
// Расписание (например, раз в 15 минут):
//   */15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/rubric-score >> /var/log/rubric-score.log 2>&1
const MAX_PER_RUN = 15

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun("rubric-score")
  try {
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
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(and(
        isNull(candidates.rubricScore),
        eq(vacancies.status, "published"),
        isNull(vacancies.deletedAt),
        or(isNotNull(candidates.anketaAnswers), isNotNull(candidates.keySkills)),
      ))
      .limit(MAX_PER_RUN)

    // Спецификация одна на вакансию — кэшируем.
    const specCache = new Map<string, ReturnType<typeof buildSpecFromAnketa>>()
    const specFor = (vacancyId: string, descriptionJson: unknown) => {
      let spec = specCache.get(vacancyId)
      if (!spec) {
        const anketa = (descriptionJson as Record<string, unknown> | null)?.anketa as Record<string, unknown> | undefined
        spec = buildSpecFromAnketa(anketa)
        specCache.set(vacancyId, spec)
      }
      return spec
    }

    const settled = await Promise.allSettled(rows.map(async c => {
      const spec = specFor(c.vacancyId, c.descriptionJson)
      const result = await scoreResumeRubric(spec, buildResumeText(c))
      await db.update(candidates)
        .set({ rubricScore: result.total, rubricDetails: result, rubricScoredAt: new Date() })
        .where(eq(candidates.id, c.id))
    }))

    const scored = settled.filter(s => s.status === "fulfilled").length
    console.log(`[rubric-score] candidates=${rows.length} scored=${scored}`)
    await finishCronRun(run.id, "ok", { candidates: rows.length, scored })
    return NextResponse.json({ candidates: rows.length, scored })
  } catch (e) {
    await finishCronRun(run.id, "error", null, e instanceof Error ? e.message : String(e))
    throw e
  }
}
