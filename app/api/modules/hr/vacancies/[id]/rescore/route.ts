// POST /api/modules/hr/vacancies/[id]/rescore
// Переоценка выделенных кандидатов вакансии по выбранному параметру:
//   resume — AI-резюме (resume_score), ai — AI-оценка (ai_score),
//   rubric — AI-рубрика (rubric_score), test — AI-тест (test_submissions.ai_score),
//   all — все четыре.
// Body: { candidateIds: string[], dimension: 'resume'|'ai'|'rubric'|'test'|'all' }
// Реальные AI-вызовы (стоят денег) → работаем ТОЛЬКО по выделенным, максимум 50 за раз.
import { NextRequest } from "next/server"
import { and, eq, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, testSubmissions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { screenResume } from "@/lib/ai-screen-resume"
import { scoreCandidateById } from "@/lib/ai-score-candidate"
import { scoreCandidateV2 } from "@/lib/ai-score-candidate-v2"
import { scoreResumeRubric } from "@/lib/scoring/rubric"
import { buildSpecFromAnketa, buildResumeText } from "@/lib/scoring/vacancy-spec"
import { scoreTestSubmission } from "@/lib/ai-score-test"
import { isSpecScoringEnabled, buildSpecResumeInput, specHasScoringContent } from "@/lib/core/spec/resume-input"
import { getSpec } from "@/lib/core/spec/store"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Dim = "resume" | "ai" | "rubric" | "test" | "portrait" | "all"
const ALL_DIMS: Exclude<Dim, "all">[] = ["resume", "ai", "rubric", "test", "portrait"]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params
    const body = (await req.json()) as { candidateIds?: string[]; dimension?: Dim }
    const dimension: Dim = body.dimension ?? "all"
    const ids = Array.isArray(body.candidateIds) ? body.candidateIds.filter(Boolean) : []
    if (ids.length === 0) return apiError("Выделите кандидатов для переоценки", 400)
    if (ids.length > 50) return apiError("Слишком много за раз — максимум 50 кандидатов", 400)

    const [vac] = await db
      .select({
        descriptionJson: vacancies.descriptionJson,
        title: vacancies.title,
        city: vacancies.city,
        companyId: vacancies.companyId,
        portraitScoring: vacancies.portraitScoring,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac || vac.companyId !== user.companyId) return apiError("Вакансия не найдена", 404)

    const dj = (vac.descriptionJson ?? {}) as Record<string, unknown>
    const anketa = dj.anketa as Record<string, unknown> | undefined
    const testTask = dj.testTask as Record<string, unknown> | undefined

    // Только выделенные кандидаты этой вакансии (tenant-safe через vacancyId выше).
    const cands = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        city: candidates.city,
        salaryMin: candidates.salaryMin,
        experienceYears: candidates.experienceYears,
        keySkills: candidates.keySkills,
        skills: candidates.skills,
        educationLevel: candidates.educationLevel,
        workFormat: candidates.workFormat,
        languages: candidates.languages,
        relocationReady: candidates.relocationReady,
        professionalRoles: candidates.professionalRoles,
        citizenshipNames: candidates.citizenshipNames,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, vacancyId), inArray(candidates.id, ids)))

    const dims = dimension === "all" ? ALL_DIMS : [dimension]
    const result = { resume: 0, ai: 0, rubric: 0, test: 0, portrait: 0, skipped: 0, errors: 0 }

    // Портрет (spec) для переоценки резюме — тот же путь, что у живого пайплайна:
    // если заполнен и включён, оцениваем ПО НЕМУ (а не по legacy-анкете).
    const specForResume = (dims.includes("resume") && isSpecScoringEnabled(vacancyId))
      ? await getSpec(vacancyId)
      : null
    // Гейт «по Spec»: для Портрета — любое наполнение Spec (🟢/🔴/точные
    // требования), иначе переоценка ушла бы в legacy-анкету. Не-Портрет — прежнее.
    const useSpecForResume = !!specForResume
      && (vac.portraitScoring === true
        ? specHasScoringContent(specForResume)
        : (specForResume.mustHave.length > 0 || specForResume.portraitRequiredSkills.length > 0))

    for (const c of cands) {
      for (const d of dims) {
        try {
          if (d === "resume") {
            const resumeForScreen = {
              name: c.name, city: c.city, salaryMin: c.salaryMin,
              experienceYears: c.experienceYears, keySkills: c.keySkills, skills: c.skills,
              educationLevel: c.educationLevel, workFormat: c.workFormat, languages: c.languages,
              relocationReady: c.relocationReady, professionalRoles: c.professionalRoles,
              citizenshipNames: c.citizenshipNames,
            }
            const r = await screenResume(
              useSpecForResume && specForResume
                ? buildSpecResumeInput(resumeForScreen, { title: vac.title, city: vac.city }, specForResume, { respectHardness: vac.portraitScoring === true })
                : {
                    resume: resumeForScreen,
                    vacancy: {
                      title: vac.title, city: vac.city,
                      aiIdealProfile: (anketa?.aiIdealProfile as string | undefined) ?? null,
                      aiRequiredHardSkills: (anketa?.aiRequiredHardSkills as string[] | undefined) ?? null,
                      aiStopFactors: (anketa?.aiStopFactors as string[] | undefined) ?? null,
                      screeningQuestions: (anketa?.screeningQuestions as string[] | undefined) ?? null,
                      aiWeights: (anketa?.aiWeights as Record<string, string> | undefined) ?? null,
                      customCriteria: (anketa?.aiCustomCriteria as { label: string; weight: string }[] | undefined) ?? null,
                    },
                  },
            )
            if (r) {
              await db.update(candidates).set({ resumeScore: r.score }).where(eq(candidates.id, c.id))
              result.resume++
            } else {
              result.skipped++
            }
          } else if (d === "ai") {
            await scoreCandidateById({ candidateId: c.id, vacancyId, skipIfScored: false })
            result.ai++
          } else if (d === "portrait") {
            // AI-Портрет: двухпроходная оценка по критериям Портрета (ai_score_v2).
            // Требует непустой requirementsJson.must_have (Портрет настроен) — иначе
            // scoreCandidateV2 вернёт null (скип).
            const v2 = await scoreCandidateV2({ candidateId: c.id, vacancyId, skipIfScored: false })
            if (v2) {
              await db.update(candidates).set({
                aiScoreV2:        v2.score,
                aiScoreV2Details: v2,
                aiScoredAt:       new Date(),
              }).where(eq(candidates.id, c.id))
              result.portrait++
            } else {
              result.skipped++
            }
          } else if (d === "rubric") {
            const spec = buildSpecFromAnketa(anketa)
            const resumeText = buildResumeText(c)
            const rr = await scoreResumeRubric(spec, resumeText)
            await db.update(candidates)
              .set({ rubricScore: rr.total, rubricDetails: rr, rubricScoredAt: new Date() })
              .where(eq(candidates.id, c.id))
            result.rubric++
          } else if (d === "test") {
            const [sub] = await db
              .select({ id: testSubmissions.id, answerText: testSubmissions.answerText })
              .from(testSubmissions)
              .where(eq(testSubmissions.candidateId, c.id))
              .orderBy(desc(testSubmissions.submittedAt))
              .limit(1)
            if (!sub || !sub.answerText?.trim()) { result.skipped++; continue }
            const ts = await scoreTestSubmission({
              taskText: (testTask?.taskText as string) ?? "",
              answerText: sub.answerText,
              hrPrompt: (testTask?.aiPrompt as string | undefined) ?? undefined,
            })
            await db.update(testSubmissions)
              .set({ aiScore: ts.score, aiReasoning: ts.reasoning })
              .where(eq(testSubmissions.id, sub.id))
            result.test++
          }
        } catch (e) {
          result.errors++
          console.error(`[rescore] dim=${d} candidate=${c.id}`, e)
        }
      }
    }

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /vacancies/[id]/rescore]", err)
    return apiError(err instanceof Error ? err.message : "Ошибка переоценки", 500)
  }
}
