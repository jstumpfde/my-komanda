// Объективный (кодовый, без AI) скоринг ответов кандидата на структурированные
// вопросы task-блоков теста.
//
// Оцениваются типы: single / multiple / yesno / sort — сравнением с правильными
// ответами, заданными HR в редакторе (correctOptions / correctYesNo /
// correctSort). Субъективные типы (short / long / text) НЕ оцениваются здесь —
// для них существует AI-путь (scoreTestSubmission).
//
// Контракт ответа кандидата (как собирает test-client, по образцу demo-client):
//   single / yesno  → value = одна строка (текст варианта; для yesno — "yes"/"no")
//   multiple / sort → value = строки вариантов, склеенные через "|||"
//
// Баллы берутся из question.points (0 / undefined → вопрос не учитывается в
// баллах, но всё равно отмечается как оценённый — вес 0).

import type { Question } from "@/lib/course-types"

const SEP = "|||"

export interface StructuredAnswer {
  blockId: string
  questionId: string
  answerType: string
  value: string
}

export interface ObjectivePerQuestion {
  questionId: string
  answerType: string
  points: number       // вес вопроса
  awarded: number      // начислено (0 или points)
  correct: boolean
}

export interface ObjectiveResult {
  gradedCount: number       // сколько вопросов реально оценено объективно
  maxPoints: number         // сумма весов оцениваемых вопросов
  gotPoints: number         // набрано
  score: number             // 0..100 = gotPoints / maxPoints * 100 (0, если maxPoints=0)
  perQuestion: ObjectivePerQuestion[]
}

const OBJECTIVE_TYPES = new Set(["single", "multiple", "yesno", "sort"])

function valueToIndices(value: string, options: string[]): number[] {
  if (!value) return []
  const parts = value.includes(SEP) ? value.split(SEP) : [value]
  return parts
    .map((p) => options.indexOf(p))
    .filter((i) => i >= 0)
}

function arraysEqualAsSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

function arraysEqualOrdered(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// Возвращает { correct } если вопрос можно оценить объективно (есть эталон),
// иначе null (пропускаем — нет эталона / не объективный тип).
function gradeQuestion(q: Question, value: string): { correct: boolean } | null {
  const type = q.answerType
  if (!OBJECTIVE_TYPES.has(type)) return null

  if (type === "yesno") {
    if (q.correctYesNo !== "yes" && q.correctYesNo !== "no") return null
    // value хранится как "yes"/"no" (совпадает с demo-client).
    return { correct: value.trim() === q.correctYesNo }
  }

  if (type === "single" || type === "multiple") {
    if (!q.correctOptions || q.correctOptions.length === 0) return null
    const picked = valueToIndices(value, q.options || [])
    return { correct: arraysEqualAsSet(picked, q.correctOptions) }
  }

  if (type === "sort") {
    if (!q.correctSort || q.correctSort.length === 0) return null
    const picked = valueToIndices(value, q.options || [])
    return { correct: arraysEqualOrdered(picked, q.correctSort) }
  }

  return null
}

// Считает объективный результат по списку вопросов и ответов кандидата.
// questions — все вопросы task-блоков теста (id уникален), answersByQuestion —
// мапа questionId → value.
export function scoreObjective(
  questions: Question[],
  answersByQuestion: Record<string, string>,
): ObjectiveResult {
  const perQuestion: ObjectivePerQuestion[] = []
  let maxPoints = 0
  let gotPoints = 0
  let gradedCount = 0

  for (const q of questions) {
    const value = answersByQuestion[q.id] ?? ""
    const graded = gradeQuestion(q, value)
    if (!graded) continue // нет эталона / не объективный тип — пропускаем

    const points = typeof q.points === "number" && q.points > 0 ? q.points : 0
    gradedCount += 1
    maxPoints += points
    const awarded = graded.correct ? points : 0
    gotPoints += awarded
    perQuestion.push({
      questionId: q.id,
      answerType: q.answerType,
      points,
      awarded,
      correct: graded.correct,
    })
  }

  const score = maxPoints > 0 ? Math.round((gotPoints / maxPoints) * 100) : 0

  return { gradedCount, maxPoints, gotPoints, score, perQuestion }
}

// Собрать все вопросы из уроков теста в плоский список.
export function collectTaskQuestions(
  lessons: { blocks?: { type?: string; questions?: Question[] }[] }[],
): Question[] {
  const out: Question[] = []
  for (const l of lessons ?? []) {
    for (const b of l.blocks ?? []) {
      if (b.type === "task" && Array.isArray(b.questions)) {
        for (const q of b.questions) out.push(q)
      }
    }
  }
  return out
}
