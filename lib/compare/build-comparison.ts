// Сборка данных сравнения кандидатов (тест + демо + анкета).
// Используется HR-роутом (/api/modules/hr/vacancies/[id]/compare) и публичным
// роутом по share-токену (/api/public/compare/[token]).
import { and, eq, inArray, isNull, desc, asc, or, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions } from "@/lib/db/schema"
import { collectTaskQuestions, resolveOptionPoints } from "@/lib/score-test-objective"
import { renderAnswerValue } from "@/lib/demo/resolve-questions"
import type { Question } from "@/lib/course-types"

// Максимум баллов за вопрос (для шапки таблицы). single/multiple — из баллов
// по вариантам (per-option или деривированных), остальные — points.
function questionMaxPoints(q: Question): number | undefined {
  if (q.answerType === "single" || q.answerType === "multiple") {
    const op = resolveOptionPoints(q)
    const max = q.answerType === "single"
      ? Math.max(0, ...op, 0)
      : op.reduce((s, p) => s + (p > 0 ? p : 0), 0)
    return max > 0 ? max : undefined
  }
  return typeof q.points === "number" && q.points > 0 ? q.points : undefined
}

export interface CompareQItem { id: string; text: string; points?: number; answerType?: string; groupId?: string; groupLabel?: string }
export interface CompareAns { value: string | null; awarded?: number | null; max?: number | null; correct?: boolean | null }
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
    demoPercent: number | null
  }>
  sections: CompareSection[]
}

function stringifyAnswer(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) {
    const s = v.map((x) => stringifyAnswer(x) ?? "").filter(Boolean).join(", ")
    return s || null
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.text === "string") return o.text.trim() || null
    if (typeof o.value === "string") return o.value.trim() || null
    // Демо-ответ часто приходит как { "q-<id>": "текст ответа" } или {} —
    // показываем только сами тексты, без сырого JSON и фигурных скобок.
    const vals = Object.values(o).map((x) => stringifyAnswer(x) ?? "").filter(Boolean)
    return vals.length > 0 ? vals.join("; ") : null
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
      demoProgressJson: candidates.demoProgressJson,
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

  // Загружаем ВСЕ демо вакансии с kind='demo' или kind LIKE 'block:%',
  // чтобы задания из Funnel Builder (block:<uuid>) тоже попадали в матрицу.
  // Порядок — как в воронке (sort_order, затем дата создания): тот же, что в
  // списке блоков (/api/modules/hr/demos), чтобы вопросы шли по очерёдности
  // воронки (сначала Демо 1, затем Демо 2, затем Анкета), а не вперемешку.
  const allDemoRows = await db
    .select({ id: demos.id, title: demos.title, lessonsJson: demos.lessonsJson, kind: demos.kind })
    .from(demos)
    .where(and(
      eq(demos.vacancyId, vacancyId),
      or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
    ))
    .orderBy(asc(demos.sortOrder), asc(demos.createdAt))

  const testLessons = Array.isArray(testDemo?.lessonsJson)
    ? (testDemo!.lessonsJson as { blocks?: { type?: string; questions?: Question[] }[] }[])
    : []
  const testQuestions = collectTaskQuestions(testLessons)

  type RawLesson = { blocks?: { id?: string; type?: string; taskTitle?: string; taskDescription?: string; questions?: Question[] }[] }
  // demoId/demoTitle = строка-блок воронки (как названа в табе «Контент»,
  // напр. «Презентация», «Путь менеджера», «Анкета») — её используем ярлыком
  // группы-разделителя. text — taskTitle конкретного task-блока внутри (fallback).
  const demoBlocks: { blockId: string; text: string; questions: Question[]; demoId: string; demoTitle: string }[] = []
  for (const row of allDemoRows) {
    if (!Array.isArray(row.lessonsJson)) continue
    const demoTitle = (row.title || "").trim()
    for (const l of row.lessonsJson as RawLesson[]) {
      for (const b of l.blocks ?? []) {
        if (b.type === "task" && b.id) {
          demoBlocks.push({
            blockId: b.id,
            text: demoBlockLabel(b),
            questions: Array.isArray(b.questions) ? b.questions : [],
            demoId: row.id,
            demoTitle: demoTitle || demoBlockLabel(b),
          })
        }
      }
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
    questions: testQuestions.map((q) => ({ id: q.id, text: q.text, points: questionMaxPoints(q), answerType: q.answerType })),
    answers: {},
  }
  for (const c of cands) {
    const aj = subByCandidate.get(c.id) as
      | { answers?: { questionId?: string; value?: unknown }[]; objective?: { perQuestion?: { questionId?: string; awarded?: number; max?: number; correct?: boolean }[] } }
      | undefined
    const byQ: Record<string, CompareAns> = {}
    const answersArr = Array.isArray(aj?.answers) ? aj!.answers : []
    const perQ = Array.isArray(aj?.objective?.perQuestion) ? aj!.objective!.perQuestion! : []
    for (const q of testQuestions) {
      const a = answersArr.find((x) => x.questionId === q.id)
      const pq = perQ.find((x) => x.questionId === q.id)
      if (a || pq) byQ[q.id] = { value: a ? stringifyAnswer(a.value) : null, awarded: pq?.awarded ?? null, max: pq?.max ?? null, correct: pq?.correct ?? null }
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

  // «Анкета»: если у вакансии есть демо-вопросы (task-блоки) — строим строки
  // по каждому вопросу каждого блока (label = «taskTitle: текст вопроса»).
  // Это нужно для вакансий, использующих Funnel Builder с блоками kind='block:...',
  // где legacy-поля surveyResponses пусты. Fallback на ANKETA_FIELDS для вакансий
  // без демо-вопросов (старый формат).
  let anketaSection: CompareSection

  if (demoBlocks.length > 0) {
    // Разворачиваем каждый task-блок в отдельные строки по вопросам.
    // Ключ строки: "<blockId>__<questionId>" — уникален в рамках вакансии.
    // groupId/groupLabel = блок воронки (demos.title, как в табе «Контент»):
    // его название — строка-разделитель над своими вопросами (фронт рисует один
    // заголовок группы), а сам вопрос — без повторяющегося префикса «taskTitle: …».
    type DemoQRow = { id: string; text: string; blockId: string; questionId: string; options: string[]; groupId?: string; groupLabel?: string }
    const demoQRows: DemoQRow[] = []
    for (const b of demoBlocks) {
      if (b.questions.length === 0) {
        // Блок без вопросов — одна строка с именем блока, ответ = всё содержимое
        demoQRows.push({ id: `${b.blockId}__block`, text: b.text, blockId: b.blockId, questionId: "", options: [] })
      } else {
        for (const q of b.questions) {
          const text = (q.text || "").trim() || b.text
          demoQRows.push({ id: `${b.blockId}__${q.id}`, text, blockId: b.blockId, questionId: q.id, options: Array.isArray(q.options) ? q.options : [], groupId: b.demoId, groupLabel: b.demoTitle })
        }
      }
    }
    anketaSection = {
      key: "anketa", title: "Анкета", scored: false,
      questions: demoQRows.map((r) => ({ id: r.id, text: r.text, groupId: r.groupId, groupLabel: r.groupLabel })),
      answers: {},
    }
    for (const c of cands) {
      const arr = Array.isArray(c.anketaAnswers) ? (c.anketaAnswers as { blockId?: string; answer?: unknown }[]) : []
      const byRow: Record<string, CompareAns> = {}
      for (const row of demoQRows) {
        const entry = arr.find((x) => x.blockId === row.blockId)
        if (!entry) continue
        let value: string | null = null
        if (row.questionId === "") {
          // Блок без отдельных вопросов — рендерим всё содержимое ответа
          value = renderAnswerValue(entry.answer, row.options)
        } else {
          // Достаём ответ на конкретный вопрос из объекта ответа блока
          const answerObj = entry.answer
          if (answerObj && typeof answerObj === "object" && !Array.isArray(answerObj)) {
            const perQ = (answerObj as Record<string, unknown>)[row.questionId]
            value = renderAnswerValue(perQ, row.options)
          } else {
            value = renderAnswerValue(answerObj, row.options)
          }
        }
        if (value) byRow[row.id] = { value }
      }
      anketaSection.answers[c.id] = byRow
    }
  } else {
    // Fallback: legacy anketa fields из surveyResponses
    anketaSection = {
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
  }

  // «Вопросы демонстрации» дублируют «Анкету» когда есть demo-блоки —
  // оставляем только один из двух разделов. Если есть demo-вопросы,
  // demoSection становится избыточным (anketa его заменяет).
  const sections = [testSection, ...(demoBlocks.length === 0 ? [demoSection] : []), anketaSection].filter((s) => s.questions.length > 0)

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
      // Демо-«скор» = процент пройденного демо (своей оценки у демо нет).
      let demoPercent: number | null = null
      const dp = c.demoProgressJson as { blocks?: { status?: string }[]; totalBlocks?: number } | null
      if (dp && Array.isArray(dp.blocks)) {
        const done = dp.blocks.filter((b) => b?.status === "completed").length
        const total = typeof dp.totalBlocks === "number" && dp.totalBlocks > 0 ? dp.totalBlocks : dp.blocks.length
        if (total > 0) demoPercent = Math.min(100, Math.round((done / total) * 100))
      }
      return {
        id: c.id, name: c.name, aiScore: c.aiScore, resumeScore: c.resumeScore,
        isFavorite: c.isFavorite ?? false, stage: c.stage ?? null, testScore, testPoints, demoPercent,
      }
    })

  return { candidates: orderedCandidates, sections }
}
