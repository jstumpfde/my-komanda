// Сборка данных сравнения кандидатов (тест + демо + анкета).
// Используется HR-роутом (/api/modules/hr/vacancies/[id]/compare) и публичным
// роутом по share-токену (/api/public/compare/[token]).
import { and, eq, inArray, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions } from "@/lib/db/schema"
import { collectTaskQuestions } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

export interface CompareQItem { id: string; text: string; points?: number }
export interface CompareAns { value: string | null; awarded?: number | null; correct?: boolean | null }
export interface CompareSection {
  key: "test" | "demo" | "anketa"
  title: string
  scored: boolean
  questions: CompareQItem[]
  answers: Record<string, Record<string, CompareAns>>
}
export interface CompareResult {
  candidates: Array<{
    id: string; name: string | null; aiScore: number | null; resumeScore: number | null
    isFavorite: boolean; stage: string | null
    testScore: number | null; testPoints: { got: number; max: number } | null
  }>
  sections: CompareSection[]
}

function stringifyAnswer(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return v.map((x) => stringifyAnswer(x) ?? "").filter(Boolean).join(", ")
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.text === "string") return o.text
    if (typeof o.value === "string") return o.value
    try { return JSON.stringify(o) } catch { return null }
  }
  return null
}

function demoBlockLabel(b: { taskTitle?: string; questions?: Question[] }): string {
  if (b.taskTitle && b.taskTitle.trim()) return b.taskTitle.trim()
  const q0 = Array.isArray(b.questions) ? b.questions[0] : undefined
  if (q0?.text && q0.text.trim()) return q0.text.trim()
  return "Вопрос демонстрации"
}

const ANKETA_FIELDS: { key: string; text: string }[] = [
  { key: "experienceSummary",    text: "Опыт (резюме)" },
  { key: "employmentPreference", text: "Формат занятости" },
  { key: "portfolioUrl",         text: "Портфолио" },
  { key: "salaryExpectation",    text: "Зарплатные ожидания" },
  { key: "city",                 text: "Город" },
  { key: "about",                text: "О себе" },
]

/**
 * Собирает сравнение для кандидатов конкретной вакансии. Порядок кандидатов —
 * как в массиве ids. Удалённые (deleted_at) исключаются. Доступ/принадлежность
 * к компании проверяет вызывающий роут.
 */
export async function buildComparison(vacancyId: string, ids: string[]): Promise<CompareResult> {
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

  const subs = ids.length > 0
    ? await db
        .select({
          candidateId: testSubmissions.candidateId,
          answersJson: testSubmissions.answersJson,
          submittedAt: testSubmissions.submittedAt,
        })
        .from(testSubmissions)
        .where(inArray(testSubmissions.candidateId, ids))
        .orderBy(desc(testSubmissions.submittedAt))
    : []
  const subByCandidate = new Map<string, unknown>()
  for (const s of subs) {
    if (!subByCandidate.has(s.candidateId) && s.answersJson) subByCandidate.set(s.candidateId, s.answersJson)
  }

  const testSection: CompareSection = {
    key: "test", title: "Тест", scored: true,
    questions: testQuestions.map((q) => ({ id: q.id, text: q.text, points: q.points })),
    answers: {},
  }
  for (const c of cands) {
    const aj = subByCandidate.get(c.id) as
      | { answers?: { questionId?: string; value?: unknown }[]; objective?: { perQuestion?: { questionId?: string; awarded?: number; correct?: boolean }[] } }
      | undefined
    const byQ: Record<string, CompareAns> = {}
    const answersArr = Array.isArray(aj?.answers) ? aj!.answers : []
    const perQ = Array.isArray(aj?.objective?.perQuestion) ? aj!.objective!.perQuestion! : []
    for (const q of testQuestions) {
      const a = answersArr.find((x) => x.questionId === q.id)
      const pq = perQ.find((x) => x.questionId === q.id)
      if (a || pq) byQ[q.id] = { value: a ? stringifyAnswer(a.value) : null, awarded: pq?.awarded ?? null, correct: pq?.correct ?? null }
    }
    testSection.answers[c.id] = byQ
  }

  const demoSection: CompareSection = {
    key: "demo", title: "Вопросы демонстрации", scored: false,
    questions: demoBlocks.map((b) => ({ id: b.blockId, text: b.text })),
    answers: {},
  }
  for (const c of cands) {
    const arr = Array.isArray(c.anketaAnswers) ? (c.anketaAnswers as { blockId?: string; answer?: unknown }[]) : []
    const byBlock: Record<string, CompareAns> = {}
    for (const b of demoBlocks) {
      const a = arr.find((x) => x.blockId === b.blockId)
      if (a) byBlock[b.blockId] = { value: stringifyAnswer(a.answer) }
    }
    demoSection.answers[c.id] = byBlock
  }

  const anketaSection: CompareSection = {
    key: "anketa", title: "Анкета", scored: false,
    questions: ANKETA_FIELDS.map((f) => ({ id: f.key, text: f.text })),
    answers: {},
  }
  for (const c of cands) {
    const sr = (c.surveyResponses && typeof c.surveyResponses === "object") ? c.surveyResponses as Record<string, unknown> : {}
    const byField: Record<string, CompareAns> = {}
    for (const f of ANKETA_FIELDS) {
      const v = stringifyAnswer(sr[f.key])
      if (v) byField[f.key] = { value: v }
    }
    anketaSection.answers[c.id] = byField
  }

  const sections = [testSection, demoSection, anketaSection].filter((s) => s.questions.length > 0)

  const byId = new Map(cands.map((c) => [c.id, c]))
  const orderedCandidates = ids
    .map((cid) => byId.get(cid))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => {
      const aj = subByCandidate.get(c.id) as { objective?: { score?: number; gotPoints?: number; maxPoints?: number } } | undefined
      const obj = aj?.objective
      const testScore = typeof obj?.score === "number" ? obj.score : null
      const testPoints = (typeof obj?.gotPoints === "number" && typeof obj?.maxPoints === "number")
        ? { got: obj.gotPoints, max: obj.maxPoints } : null
      return {
        id: c.id, name: c.name, aiScore: c.aiScore, resumeScore: c.resumeScore,
        isFavorite: c.isFavorite ?? false, stage: c.stage ?? null, testScore, testPoints,
      }
    })

  return { candidates: orderedCandidates, sections }
}
