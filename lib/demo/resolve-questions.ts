/**
 * Shared helper: resolves demo block IDs to their question metadata.
 *
 * Demo blocks with type="task" live inside demos.lessons_json[].blocks[].
 * Demos can have kind='demo' (legacy) OR kind LIKE 'block:<uuid>' (Funnel Builder).
 * This module merges all blocks across all relevant demos for a vacancy so that
 * any blk-... id found in candidates.anketa_answers can be resolved.
 */

import type { Question } from "@/lib/course-types"

export interface ResolvedBlock {
  /** HR-friendly section title (the block's taskTitle) */
  taskTitle: string
  questions: Array<{
    id: string
    text: string
    options: string[]
    answerType: string
    points?: number
    aiCriteria?: string
    required?: boolean
  }>
}

/** Map from blockId → ResolvedBlock */
export type BlockResolver = Map<string, ResolvedBlock>

type RawLesson = {
  blocks?: Array<{
    id?: string
    type?: string
    taskTitle?: string
    taskDescription?: string
    questions?: Question[]
  }>
}

/**
 * Build a resolver map from an array of lessons_json arrays (one per demo row).
 * All task-type blocks from all provided lessons are merged into one map.
 * The block's own id is the key (e.g. "blk-1782306625009-udf4").
 */
export function buildBlockResolver(allLessonsJsons: unknown[]): BlockResolver {
  const map: BlockResolver = new Map()
  for (const lessonsJson of allLessonsJsons) {
    if (!Array.isArray(lessonsJson)) continue
    for (const lesson of lessonsJson as RawLesson[]) {
      if (!lesson || !Array.isArray(lesson.blocks)) continue
      for (const block of lesson.blocks) {
        if (!block || block.type !== "task" || !block.id) continue
        const questions = Array.isArray(block.questions)
          ? block.questions.map((q) => ({
              id: q.id,
              text: q.text ?? "",
              options: Array.isArray(q.options) ? q.options : [],
              answerType: q.answerType ?? "short",
              points: typeof q.points === "number" ? q.points : undefined,
              aiCriteria: typeof q.aiCriteria === "string" ? q.aiCriteria : undefined,
              required: q.required === true,
            }))
          : []
        map.set(block.id, {
          taskTitle: block.taskTitle?.trim() || block.taskDescription?.trim() || "Вопрос",
          questions,
        })
      }
    }
  }
  return map
}

/**
 * Render a candidate's answer value to a readable string.
 * Multi-select answers are stored as values joined by "|||".
 * For single/multiple with options, the raw value IS the option text already.
 */
export function renderAnswerValue(
  raw: unknown,
  options: string[],
): string | null {
  if (raw == null) return null

  // Multi-select stored as "option1|||option2"
  if (typeof raw === "string") {
    if (!raw.trim()) return null
    if (raw.includes("|||")) {
      const parts = raw.split("|||").map((s) => s.trim()).filter(Boolean)
      return parts.join(", ")
    }
    return raw
  }

  if (typeof raw === "number" || typeof raw === "boolean") return String(raw)

  if (Array.isArray(raw)) {
    const parts = raw.map((x) => renderAnswerValue(x, options)).filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(", ") : null
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>
    // View-marker only: { viewed: true } — skip
    const keys = Object.keys(o).filter((k) => k !== "viewed" && k !== "viewedAt" && k !== "timeSpent")
    if (keys.length === 0) return null
    // Per-question map: { "q-123": "answer text" }
    const vals = Object.values(o)
      .map((v) => renderAnswerValue(v, options))
      .filter(Boolean) as string[]
    return vals.length > 0 ? vals.join("; ") : null
  }

  return null
}

// ─── Demo completion by answers ─────────────────────────────────────────────

/** Минимальная форма записи ответа кандидата из candidates.anketa_answers. */
export interface AnketaAnswerEntry {
  blockId?: string
  answer?: unknown
  answeredAt?: string
  timeSpent?: number
}

/** View-маркер `{ viewed: true }` (и пр.) — НЕ считается ответом. */
function isViewMarkerOnly(answer: unknown): boolean {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false
  const o = answer as Record<string, unknown>
  const meaningful = Object.keys(o).filter(
    (k) => k !== "viewed" && k !== "viewedAt" && k !== "timeSpent",
  )
  return meaningful.length === 0
}

/** Есть ли непустой ответ на конкретный вопрос внутри ответа блока. */
function hasNonEmptyAnswerFor(blockAnswer: unknown, questionId: string): boolean {
  if (blockAnswer == null) return false
  if (isViewMarkerOnly(blockAnswer)) return false

  // Ответ блока обычно — объект { [questionId]: value }.
  if (typeof blockAnswer === "object" && !Array.isArray(blockAnswer)) {
    const o = blockAnswer as Record<string, unknown>
    if (questionId in o) {
      return !isEmptyAnswerValue(o[questionId])
    }
    // Нет ключа под этот вопрос — но в блоке мог быть один вопрос и ответ
    // записан "плоско" (строкой/медиа). Считаем ответом, если объект несёт
    // что-то осмысленное (не только view-маркеры).
    return !isViewMarkerOnly(blockAnswer)
  }

  // Плоский ответ (строка/медиа/массив) на блок с одним вопросом.
  return !isEmptyAnswerValue(blockAnswer)
}

/** Пустой ли ответ: null/""/пустой массив/только-маркер. */
function isEmptyAnswerValue(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.filter((x) => !isEmptyAnswerValue(x)).length === 0
  if (typeof v === "object") {
    // Медиа-ответ { url, mediaType } — непустой.
    const o = v as Record<string, unknown>
    if (typeof o.url === "string" && o.url.trim()) return false
    if (isViewMarkerOnly(v)) return true
    return Object.keys(o).length === 0
  }
  return false
}

/**
 * Демо «пройдено по ответам»: кандидат ответил на ВСЕ обязательные вопросы
 * (questions[].required===true во всех task-блоках всех демо вакансии),
 * даже если по блокам/страницам прогресс < 100% (хвост декоративных блоков
 * после вопросов кандидат мог не пролистать).
 *
 * Опирается на blockId/questionId из ОТВЕТОВ кандидата, а не на совпадение
 * id блоков с текущим демо (демо могли пересобрать → новые id). Если у демо
 * нет обязательных вопросов — возвращает false (старое поведение прогресс-бара
 * сохраняется, признак «пройдено по ответам» не включается).
 *
 * @param allLessonsJsons массив lessons_json всех демо вакансии (kind='demo' и block:%)
 * @param anketaAnswers   candidates.anketa_answers (массив записей)
 */
export function hasAnsweredAllRequired(
  allLessonsJsons: unknown[],
  anketaAnswers: unknown,
): boolean {
  const answers: AnketaAnswerEntry[] = Array.isArray(anketaAnswers)
    ? (anketaAnswers as AnketaAnswerEntry[])
    : anketaAnswers && typeof anketaAnswers === "object"
      ? (Object.values(anketaAnswers as Record<string, AnketaAnswerEntry>))
      : []

  // Индексируем ВСЕ записи ответов по blockId (кандидат мог переотправить блок —
  // ранняя запись может быть view-маркером, поздняя — реальным ответом).
  const answersByBlock = new Map<string, unknown[]>()
  for (const a of answers) {
    if (!a || typeof a !== "object") continue
    const bid = a.blockId
    if (typeof bid !== "string" || !bid) continue
    const arr = answersByBlock.get(bid) ?? []
    arr.push(a.answer)
    answersByBlock.set(bid, arr)
  }

  // Проверка одного демо: ответил ли кандидат на ВСЕ его обязательные вопросы.
  const demoFullyAnswered = (lessonsJson: unknown): boolean => {
    const resolver = buildBlockResolver([lessonsJson])
    const requiredByBlock: Array<{ blockId: string; questionIds: string[] }> = []
    for (const [blockId, block] of resolver.entries()) {
      const requiredIds = block.questions.filter((q) => q.required).map((q) => q.id)
      if (requiredIds.length > 0) requiredByBlock.push({ blockId, questionIds: requiredIds })
    }
    // У демо нет обязательных вопросов — оно не даёт признак «пройдено по ответам».
    if (requiredByBlock.length === 0) return false
    for (const blk of requiredByBlock) {
      const blockAnswers = answersByBlock.get(blk.blockId)
      if (!blockAnswers || blockAnswers.length === 0) return false
      for (const qid of blk.questionIds) {
        const answered = blockAnswers.some((ba) => hasNonEmptyAnswerFor(ba, qid))
        if (!answered) return false
      }
    }
    return true
  }

  // У вакансии может быть НЕСКОЛЬКО альтернативных демо (напр. «Презентация» и
  // «Путь менеджера»). Кандидат проходит ОДНО из них. Поэтому «пройдено по
  // ответам» = он ответил на все обязательные вопросы ХОТЯ БЫ ОДНОГО демо,
  // а не сразу всех (иначе с двумя демо признак никогда не срабатывал).
  for (const lessonsJson of allLessonsJsons) {
    if (demoFullyAnswered(lessonsJson)) return true
  }
  return false
}
