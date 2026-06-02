// GET /api/modules/hr/vacancies/[id]/compare?ids=c1,c2,c3
//
// Единая выборка ответов нескольких кандидатов для страницы сравнения.
// Три секции:
//   • test  — вопросы теста (demos kind='test') + ответы из test_submissions
//             (со скорингом objective.perQuestion);
//   • demo  — вопросы-блоки демонстрации (demos kind='demo', type='task') +
//             ответы из candidates.anketa_answers (по blockId, без скоринга);
//   • anketa — профильные поля из candidates.survey_responses (опыт, портфолио,
//             формат занятости и т.п.) — то, что удобно сравнивать.
//
// Формат ответа заточен под матрицу «вопросы × кандидаты» и режим «по вопросам».
import { and, eq, inArray, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { collectTaskQuestions } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

const MAX_COMPARE = 12

interface QItem {
  id: string          // questionId (тест/анкета) или blockId (демо)
  text: string
  points?: number
}
interface PerCandidateAnswer {
  value: string | null
  awarded?: number | null
  correct?: boolean | null
}
interface CompareSection {
  key: "test" | "demo" | "anketa"
  title: string
  scored: boolean
  questions: QItem[]
  // answers[candidateId][questionId] = ответ
  answers: Record<string, Record<string, PerCandidateAnswer>>
}

// Привести любой ответ к строке для показа.
function stringifyAnswer(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return v.map((x) => stringifyAnswer(x) ?? "").filter(Boolean).join(", ")
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    // demo-ответ часто { text, mediaType } — берём text.
    if (typeof o.text === "string") return o.text
    if (typeof o.value === "string") return o.value
    try { return JSON.stringify(o) } catch { return null }
  }
  return null
}

// Текст «вопроса» для демо-блока: заголовок задания или текст первого вопроса.
function demoBlockLabel(b: { taskTitle?: string; questions?: Question[] }): string {
  if (b.taskTitle && b.taskTitle.trim()) return b.taskTitle.trim()
  const q0 = Array.isArray(b.questions) ? b.questions[0] : undefined
  if (q0?.text && q0.text.trim()) return q0.text.trim()
  return "Вопрос демонстрации"
}

// Профильные поля анкеты (survey_responses) — что реально сравнивать.
const ANKETA_FIELDS: { key: string; text: string }[] = [
  { key: "experienceSummary",   text: "Опыт (резюме)" },
  { key: "employmentPreference", text: "Формат занятости" },
  { key: "portfolioUrl",        text: "Портфолио" },
  { key: "salaryExpectation",   text: "Зарплатные ожидания" },
  { key: "city",                text: "Город" },
  { key: "about",               text: "О себе" },
]

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params
    const url = new URL(req.url)
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_COMPARE)
    if (ids.length === 0) return apiError("ids required", 400)

    // Вакансия — только своя компания.
    const [vac] = await db
      .select({ companyId: vacancies.companyId, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    // Кандидаты этой вакансии (без корзины).
    const cands = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        anketaAnswers: candidates.anketaAnswers,
        surveyResponses: candidates.surveyResponses,
        aiScore: candidates.aiScore,
        resumeScore: candidates.resumeScore,
        isFavorite: candidates.isFavorite,
        stage: candidates.stage,
      })
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, vacancyId),
        inArray(candidates.id, ids),
        isNull(candidates.deletedAt),
      ))
    if (cands.length === 0) return apiError("No candidates", 404)

    // Вопросы теста и блоки демо.
    const [testDemo] = await db
      .select({ lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    const [demoRow] = await db
      .select({ lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)

    const testLessons = Array.isArray(testDemo?.lessonsJson)
      ? (testDemo!.lessonsJson as { blocks?: { type?: string; questions?: Question[] }[] }[])
      : []
    const testQuestions = collectTaskQuestions(testLessons)

    const demoLessons = Array.isArray(demoRow?.lessonsJson)
      ? (demoRow!.lessonsJson as { blocks?: { id?: string; type?: string; taskTitle?: string; questions?: Question[] }[] }[])
      : []
    const demoBlocks: { blockId: string; text: string }[] = []
    for (const l of demoLessons) {
      for (const b of l.blocks ?? []) {
        if (b.type === "task" && b.id) demoBlocks.push({ blockId: b.id, text: demoBlockLabel(b) })
      }
    }

    // Последняя сабмишка теста по каждому кандидату (с answersJson).
    const subs = await db
      .select({
        candidateId: testSubmissions.candidateId,
        answersJson: testSubmissions.answersJson,
        submittedAt: testSubmissions.submittedAt,
      })
      .from(testSubmissions)
      .where(inArray(testSubmissions.candidateId, ids))
      .orderBy(desc(testSubmissions.submittedAt))
    const subByCandidate = new Map<string, unknown>()
    for (const s of subs) {
      if (!subByCandidate.has(s.candidateId) && s.answersJson) {
        subByCandidate.set(s.candidateId, s.answersJson)
      }
    }

    // ── Секция «Тест» ──────────────────────────────────────────────
    const testSection: CompareSection = {
      key: "test", title: "Тест", scored: true,
      questions: testQuestions.map((q) => ({ id: q.id, text: q.text, points: q.points })),
      answers: {},
    }
    for (const c of cands) {
      const aj = subByCandidate.get(c.id) as
        | { answers?: { questionId?: string; value?: unknown }[]; objective?: { perQuestion?: { questionId?: string; awarded?: number; correct?: boolean }[] } }
        | undefined
      const byQ: Record<string, PerCandidateAnswer> = {}
      const answersArr = Array.isArray(aj?.answers) ? aj!.answers : []
      const perQ = Array.isArray(aj?.objective?.perQuestion) ? aj!.objective!.perQuestion! : []
      for (const q of testQuestions) {
        const a = answersArr.find((x) => x.questionId === q.id)
        const pq = perQ.find((x) => x.questionId === q.id)
        if (a || pq) {
          byQ[q.id] = {
            value: a ? stringifyAnswer(a.value) : null,
            awarded: pq?.awarded ?? null,
            correct: pq?.correct ?? null,
          }
        }
      }
      testSection.answers[c.id] = byQ
    }

    // ── Секция «Демонстрация» ─────────────────────────────────────
    const demoSection: CompareSection = {
      key: "demo", title: "Вопросы демонстрации", scored: false,
      questions: demoBlocks.map((b) => ({ id: b.blockId, text: b.text })),
      answers: {},
    }
    for (const c of cands) {
      const arr = Array.isArray(c.anketaAnswers) ? (c.anketaAnswers as { blockId?: string; answer?: unknown }[]) : []
      const byBlock: Record<string, PerCandidateAnswer> = {}
      for (const b of demoBlocks) {
        const a = arr.find((x) => x.blockId === b.blockId)
        if (a) byBlock[b.blockId] = { value: stringifyAnswer(a.answer) }
      }
      demoSection.answers[c.id] = byBlock
    }

    // ── Секция «Анкета» (профиль из survey_responses) ─────────────
    const anketaSection: CompareSection = {
      key: "anketa", title: "Анкета", scored: false,
      questions: ANKETA_FIELDS.map((f) => ({ id: f.key, text: f.text })),
      answers: {},
    }
    for (const c of cands) {
      const sr = (c.surveyResponses && typeof c.surveyResponses === "object")
        ? c.surveyResponses as Record<string, unknown> : {}
      const byField: Record<string, PerCandidateAnswer> = {}
      for (const f of ANKETA_FIELDS) {
        const v = stringifyAnswer(sr[f.key])
        if (v) byField[f.key] = { value: v }
      }
      anketaSection.answers[c.id] = byField
    }

    // Только непустые секции.
    const sections = [testSection, demoSection, anketaSection].filter((s) => s.questions.length > 0)

    // Кандидаты в порядке переданных ids.
    const byId = new Map(cands.map((c) => [c.id, c]))
    const orderedCandidates = ids
      .map((cid) => byId.get(cid))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, name: c.name, aiScore: c.aiScore, resumeScore: c.resumeScore, isFavorite: c.isFavorite ?? false, stage: c.stage ?? null }))

    return apiSuccess({ candidates: orderedCandidates, sections })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
