/**
 * Детерминированный «балл по выбору» для гейта 2-й части демо.
 *
 * В отличие от lib/demo/score-answers.ts (AI-оценка task-вопросов с aiCriteria),
 * здесь считается ТОЛЬКО объективный балл по вопросам-выбора (single/multiple/
 * yesno/sort) через lib/score-test-objective. Открытые/AI-вопросы (short/long/
 * text) скорер пропускает сам — поэтому балл детерминированный и не «пляшет».
 *
 * Версия демо кандидата определяется по перекрытию blockId-ов его ответов
 * (та же логика, что в score-answers): кандидат проходит ОДНО из демо вакансии,
 * считаем гейт по тому, где он реально отвечал.
 *
 * Возвращает null, если у вакансии нет оцениваемых вопросов-выбора или у
 * кандидата нет ответов (гейт не применяется — ничего не шлём).
 */

import { eq, and, like, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos } from "@/lib/db/schema"
import { buildBlockResolver } from "@/lib/demo/resolve-questions"
import {
  collectTaskQuestions,
  scoreObjective,
  type ObjectiveResult,
} from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

interface DemoVersion {
  blockIds: Set<string>
  questions: Question[]
}

/** "|||"-склейка для multiple/sort, строка как есть для single/yesno. */
function answerToValue(raw: unknown): string {
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).join("|||")
  }
  return ""
}

/**
 * Объективный балл кандидата по вопросам-выбора его версии демо.
 * @returns ObjectiveResult или null (нет вопросов-эталонов / нет ответов).
 */
export async function computeObjectiveGateScore(
  candidateId: string,
  vacancyId: string,
): Promise<ObjectiveResult | null> {
  const [candidate] = await db
    .select({ anketaAnswers: candidates.anketaAnswers })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
    .limit(1)
  if (!candidate) return null

  const demoRows = await db
    .select({ lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(and(
      eq(demos.vacancyId, vacancyId),
      or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
    ))
  if (demoRows.length === 0) return null

  // Каждая строка demos = отдельная версия. blockIds — для выбора версии,
  // questions — все task-вопросы (scoreObjective сам отсеет не-объективные).
  const versions: DemoVersion[] = demoRows.map((r) => {
    const lessons = Array.isArray(r.lessonsJson) ? (r.lessonsJson as { blocks?: { type?: string; questions?: Question[] }[] }[]) : []
    return {
      blockIds: new Set(buildBlockResolver([r.lessonsJson]).keys()),
      questions: collectTaskQuestions(lessons),
    }
  }).filter((v) => v.questions.length > 0)
  if (versions.length === 0) return null

  // Индексируем ответы кандидата по blockId.
  const rawAnswers: Array<{ blockId?: string; answer?: unknown }> = Array.isArray(candidate.anketaAnswers)
    ? (candidate.anketaAnswers as Array<{ blockId?: string; answer?: unknown }>)
    : []
  const answeredBlockIds = new Set<string>()
  // questionId → value (берём первый непустой ответ на вопрос).
  const answersByQuestion: Record<string, string> = {}
  for (const entry of rawAnswers) {
    const bid = entry?.blockId
    if (typeof bid === "string" && bid) answeredBlockIds.add(bid)
    const ans = entry?.answer
    if (ans && typeof ans === "object" && !Array.isArray(ans)) {
      for (const [qid, val] of Object.entries(ans as Record<string, unknown>)) {
        if (qid === "viewed" || qid === "viewedAt" || qid === "timeSpent") continue
        const v = answerToValue(val)
        if (v && !answersByQuestion[qid]) answersByQuestion[qid] = v
      }
    }
  }

  // Выбираем версию демо кандидата по максимальному перекрытию blockId-ов.
  let version = versions[0]
  if (versions.length > 1) {
    let bestOverlap = -1
    for (const v of versions) {
      let overlap = 0
      for (const bid of answeredBlockIds) if (v.blockIds.has(bid)) overlap++
      if (overlap > bestOverlap) { bestOverlap = overlap; version = v }
    }
  }

  const result = scoreObjective(version.questions, answersByQuestion)
  // Нет ни одного оцениваемого объективно вопроса — гейт не применяется.
  if (result.gradedCount === 0 || result.maxPoints === 0) return null
  return result
}

/**
 * Пер-блочный объективный балл (Вариант Б, легаси-мост): считает балл по
 * ВЫБОРНЫМ вопросам (correctOptions) для КАЖДОГО контент-блока отдельно.
 * Ключ = demos.id. { [demoId]: { title, score, gradedCount, correctCount } }.
 * Блоки без объективных вопросов пропускаются. Зеркало scoreDemoAnswers (AI).
 */
export async function computeBlockObjectiveScores(
  candidateId: string,
  vacancyId: string,
): Promise<Record<string, { title: string; score: number; gradedCount: number; correctCount: number }>> {
  const out: Record<string, { title: string; score: number; gradedCount: number; correctCount: number }> = {}

  const [candidate] = await db
    .select({ anketaAnswers: candidates.anketaAnswers })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
    .limit(1)
  if (!candidate) return out

  const demoRows = await db
    .select({ id: demos.id, title: demos.title, lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(and(
      eq(demos.vacancyId, vacancyId),
      or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
    ))
    .orderBy(demos.sortOrder, demos.createdAt)
  if (demoRows.length === 0) return out

  // Ответы кандидата: questionId → value (первый непустой).
  const rawAnswers: Array<{ blockId?: string; answer?: unknown }> = Array.isArray(candidate.anketaAnswers)
    ? (candidate.anketaAnswers as Array<{ blockId?: string; answer?: unknown }>)
    : []
  const answersByQuestion: Record<string, string> = {}
  for (const entry of rawAnswers) {
    const ans = entry?.answer
    if (ans && typeof ans === "object" && !Array.isArray(ans)) {
      for (const [qid, val] of Object.entries(ans as Record<string, unknown>)) {
        if (qid === "viewed" || qid === "viewedAt" || qid === "timeSpent") continue
        const v = answerToValue(val)
        if (v && !answersByQuestion[qid]) answersByQuestion[qid] = v
      }
    }
  }

  for (const demo of demoRows) {
    const lessons = Array.isArray(demo.lessonsJson) ? (demo.lessonsJson as { blocks?: { type?: string; questions?: Question[] }[] }[]) : []
    const questions = collectTaskQuestions(lessons)
    if (questions.length === 0) continue
    const r = scoreObjective(questions, answersByQuestion)
    if (r.gradedCount === 0 || r.maxPoints === 0) continue // нет объективных вопросов в блоке
    out[demo.id] = {
      title: demo.title,
      score: r.score,
      gradedCount: r.gradedCount,
      correctCount: r.perQuestion.filter((q) => q.correct).length,
    }
  }
  return out
}
