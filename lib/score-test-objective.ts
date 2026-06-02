// Объективный (кодовый, без AI) скоринг ответов кандидата на структурированные
// вопросы task-блоков теста.
//
// Оцениваются типы: single / multiple / yesno / sort. Субъективные типы
// (short / long / text) НЕ оцениваются здесь — для них AI-путь (scoreTestSubmission).
//
// Контракт ответа кандидата (как собирает test-client, по образцу demo-client):
//   single / yesno  → value = одна строка (текст варианта; для yesno — "yes"/"no")
//   multiple / sort → value = строки вариантов, склеенные через "|||"
//
// ─── Скоринг single / multiple: баллы на каждый вариант (per-option) ──────────
// У каждого варианта свой балл (Question.optionPoints, index-aligned с options):
//   • single   → got = балл выбранного варианта (обрезается ≥ 0).
//   • multiple → got = сумма баллов выбранных вариантов, обрезается в [0 … max].
// Отрицательные баллы = штраф за лишний/ловушку. max вопроса:
//   • single   → максимальный положительный балл среди вариантов.
//   • multiple → сумма всех положительных баллов.
// Если optionPoints у вопроса НЕ задан — деривится из correctOptions + points:
//   • верные варианты делят points поровну (+), неверные у multiple получают
//     симметричный штраф (−), у single — 0. Так старые тесты автоматически
//     получают частичный скоринг, а max остаётся равным points.
//
// yesno / sort — всё-или-ничего (got = points при точном совпадении, иначе 0).

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
  points: number       // вес вопроса (= max)
  max: number          // максимум баллов за вопрос
  awarded: number      // начислено (0 … max)
  correct: boolean     // true = полный балл (awarded >= max && max > 0)
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

function arraysEqualOrdered(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// Заданы ли баллы по вариантам вручную (HR включил режим per-option). Признак —
// массив optionPoints нужной длины. Значения могут быть и нулевыми.
function hasManualOptionPoints(q: Question): boolean {
  return Array.isArray(q.optionPoints) && q.optionPoints.length === (q.options?.length ?? 0)
}

// Баллы на вариант: либо заданные HR (optionPoints), либо деривированные из
// correctOptions + points. Длина результата = options.length.
export function resolveOptionPoints(q: Question): number[] {
  const options = q.options || []
  const n = options.length
  // Заданы вручную (per-option режим) — берём как есть (нечисловые → 0).
  if (hasManualOptionPoints(q)) {
    return options.map((_, i) => {
      const v = q.optionPoints![i]
      return typeof v === "number" && Number.isFinite(v) ? v : 0
    })
  }
  // Деривация из correctOptions + points.
  const correct = new Set((q.correctOptions || []).filter((i) => i >= 0 && i < n))
  const total = typeof q.points === "number" && q.points > 0 ? Math.round(q.points) : 0
  if (correct.size === 0 || total === 0) return options.map(() => 0)
  const base = Math.floor(total / correct.size)
  let rem = total - base * correct.size
  return options.map((_, i) => {
    if (correct.has(i)) {
      // Остаток раскидываем по +1 на первые верные варианты (целые баллы).
      const extra = rem > 0 ? (rem--, 1) : 0
      return base + extra
    }
    // Неверный: multiple — штраф (−base), single — нейтрально (0).
    return q.answerType === "multiple" ? -base : 0
  })
}

interface QGrade { got: number; max: number }

// Возвращает { got, max } если вопрос оценивается объективно, иначе null
// (нет эталона / не объективный тип — пропускаем).
function gradeQuestion(q: Question, value: string): QGrade | null {
  const type = q.answerType
  if (!OBJECTIVE_TYPES.has(type)) return null

  if (type === "yesno") {
    if (q.correctYesNo !== "yes" && q.correctYesNo !== "no") return null
    const max = typeof q.points === "number" && q.points > 0 ? q.points : 0
    return { got: value.trim() === q.correctYesNo ? max : 0, max }
  }

  if (type === "sort") {
    if (!q.correctSort || q.correctSort.length === 0) return null
    const max = typeof q.points === "number" && q.points > 0 ? q.points : 0
    const picked = valueToIndices(value, q.options || [])
    return { got: arraysEqualOrdered(picked, q.correctSort) ? max : 0, max }
  }

  if (type === "single" || type === "multiple") {
    const options = q.options || []
    const hasManual = hasManualOptionPoints(q) && q.optionPoints!.some((p) => typeof p === "number" && p !== 0)
    const hasCorrect = (q.correctOptions?.length ?? 0) > 0
    if (!hasManual && !hasCorrect) return null // нет эталона — пропускаем

    const op = resolveOptionPoints(q)
    const picked = valueToIndices(value, options)

    if (type === "single") {
      const max = Math.max(0, ...op, 0)
      const idx = picked[0]
      const got = typeof idx === "number" ? Math.max(0, op[idx] ?? 0) : 0
      return { got: Math.min(got, max), max }
    }
    // multiple: сумма выбранных, обрезка в [0 … сумма положительных].
    const max = op.reduce((s, p) => s + (p > 0 ? p : 0), 0)
    const sum = picked.reduce((s, i) => s + (op[i] ?? 0), 0)
    return { got: Math.max(0, Math.min(sum, max)), max }
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

    const max = Math.max(0, Math.round(graded.max))
    const awarded = Math.max(0, Math.min(Math.round(graded.got), max))
    gradedCount += 1
    maxPoints += max
    gotPoints += awarded
    perQuestion.push({
      questionId: q.id,
      answerType: q.answerType,
      points: max,
      max,
      awarded,
      correct: max > 0 && awarded >= max,
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
