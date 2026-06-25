/**
 * Рантайм воронки v2 — подсчёт балла стадии.
 *
 * Считает суммарный балл по ответам кандидата на анкету/тест ТЕКУЩЕЙ стадии.
 * Переиспользует scoreObjective из lib/score-test-objective.ts.
 *
 * Поддерживаемые типы вопросов:
 *   Объективные (без AI):  single, multiple, yesno, sort
 *   AI-оцениваемые:        short/long/text с textMatchMode='ai' (Фаза 3)
 *
 * Два режима:
 *   calcStageScore        — синхронный (только объективные; AI-вопросы → 0 баллов).
 *                           Используется для быстрого объективного подсчёта.
 *   calcStageScoreWithAI  — асинхронный (объективные + AI); нужен await.
 *                           Используется в onTestSubmitted если нужен финальный балл с AI.
 */

import {
  scoreObjective,
  collectTaskQuestions,
  type StructuredAnswer,
} from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

/** Результат подсчёта балла за стадию. */
export interface StageScoreResult {
  /** Суммарный набранный балл (0 если нет оцениваемых вопросов). */
  totalScore: number
  /** Максимально возможный балл (0 если нет оцениваемых вопросов). */
  maxScore: number
  /**
   * Процент прохождения (0–100). Если maxScore=0 — считаем 100
   * (нет критериев → считаем прошёл, чтобы не блокировать воронку).
   */
  scorePercent: number
  /** Количество оценённых вопросов. */
  gradedCount: number
  /** true если были AI-вопросы, которые НЕ были оценены (ждут async AI). */
  hasPendingAiQuestions?: boolean
}

/**
 * Вычислить балл стадии по ответам кандидата (синхронно, только объективные).
 *
 * Текстовые вопросы с textMatchMode='ai' НЕ учитываются — их балл = 0.
 * Если все вопросы — AI-текстовые, scorePercent=100 (не блокируем воронку).
 * Для точного балла с AI используйте calcStageScoreWithAI (async).
 *
 * @param lessonsJson  lessonsJson из demos (контентного блока стадии) — массив уроков.
 * @param answers      Структурированные ответы кандидата на вопросы стадии.
 * @returns StageScoreResult
 */
export function calcStageScore(
  lessonsJson: unknown,
  answers: StructuredAnswer[],
): StageScoreResult {
  const { taskQuestions, answersByQuestion } = prepareQuestions(lessonsJson, answers)

  // Флаг AI-вопросов вычисляем ВСЕГДА (независимо от наличия ответов),
  // чтобы caller мог решить запускать ли calcStageScoreWithAI.
  const hasPendingAiQuestions = taskQuestions.some(q => isAiTextQuestion(q))

  if (taskQuestions.length === 0 || answers.length === 0) {
    return { totalScore: 0, maxScore: 0, scorePercent: 100, gradedCount: 0, hasPendingAiQuestions }
  }

  // Объективный подсчёт (single/multiple/yesno/sort).
  // Текстовые (short/long/text с textMatchMode='ai') → gradeQuestion вернёт null → пропускаются.
  const result = scoreObjective(taskQuestions, answersByQuestion)

  const scorePercent = result.maxPoints > 0
    ? result.score  // уже 0–100 из scoreObjective
    : 100           // нет оцениваемых объективных вопросов → не блокируем

  return {
    totalScore:           result.gotPoints,
    maxScore:             result.maxPoints,
    scorePercent,
    gradedCount:          result.gradedCount,
    hasPendingAiQuestions,
  }
}

/**
 * Вычислить балл стадии по ответам кандидата с учётом AI-оценки текстовых вопросов.
 *
 * Алгоритм:
 *   1. Объективные вопросы (single/multiple/yesno/sort) — оцениваем кодом.
 *   2. Текстовые вопросы с textMatchMode='ai' — собираем текст + aiCriteria,
 *      отправляем в scoreTestSubmission (одним вызовом AI на весь блок AI-вопросов).
 *   3. Итог: если есть оба типа → среднее (как в /test/submit); если только AI → AI; если только obj → obj.
 *
 * Безопасность: если AI падает — возвращаем объективный балл (не блокируем воронку).
 *
 * @param lessonsJson  lessonsJson из demos.
 * @param answers      Структурированные ответы кандидата.
 * @param taskContext  Контекст задания для AI (опционально, из postDemoSettings.testTaskInstructions).
 * @param hrPrompt     Критерии оценки от HR (опционально, из postDemoSettings.testAiPrompt).
 */
export async function calcStageScoreWithAI(
  lessonsJson: unknown,
  answers: StructuredAnswer[],
  taskContext?: string,
  hrPrompt?: string,
): Promise<StageScoreResult> {
  const { taskQuestions, answersByQuestion } = prepareQuestions(lessonsJson, answers)

  if (taskQuestions.length === 0 || answers.length === 0) {
    return { totalScore: 0, maxScore: 0, scorePercent: 100, gradedCount: 0 }
  }

  // Шаг 1: объективные вопросы
  const objective = scoreObjective(taskQuestions, answersByQuestion)
  const hasObjective = objective.maxPoints > 0

  // Шаг 2: AI-вопросы (textMatchMode='ai')
  const aiQuestions = taskQuestions.filter(q => isAiTextQuestion(q))
  let aiScore: number | null = null

  if (aiQuestions.length > 0) {
    try {
      // Собираем текст для AI: вопрос + ответ кандидата + aiCriteria
      const parts: string[] = []
      for (const q of aiQuestions) {
        const val = (answersByQuestion[q.id] ?? "").trim()
        if (!val) continue
        let line = `${q.text}: ${val}`
        const crit = (q.aiCriteria ?? "").trim()
        if (crit) line += `\n  (критерий оценки: ${crit})`
        parts.push(line)
      }
      if (parts.length > 0) {
        const { scoreTestSubmission } = await import("@/lib/ai-score-test")
        const aiResult = await scoreTestSubmission({
          taskText:   taskContext ?? "",
          answerText: parts.join("\n\n"),
          hrPrompt,
        })
        aiScore = aiResult.score
      }
    } catch (err) {
      console.warn("[funnel-v2/calc-stage-score] AI-скоринг текстовых вопросов упал:", err instanceof Error ? err.message : err)
      // AI упал — продолжаем с объективным баллом
    }
  }

  // Шаг 3: финальный балл
  let scorePercent: number
  let totalScore: number
  let maxScore: number

  if (hasObjective && aiScore !== null) {
    // Оба: среднее
    scorePercent = Math.round((objective.score + aiScore) / 2)
    totalScore   = Math.round((objective.gotPoints + aiScore) / 2)
    maxScore     = objective.maxPoints
  } else if (hasObjective) {
    scorePercent = objective.score
    totalScore   = objective.gotPoints
    maxScore     = objective.maxPoints
  } else if (aiScore !== null) {
    scorePercent = aiScore
    totalScore   = aiScore
    maxScore     = 100
  } else {
    // Ни объективных, ни AI — не блокируем
    scorePercent = 100
    totalScore   = 0
    maxScore     = 0
  }

  return {
    totalScore,
    maxScore,
    scorePercent,
    gradedCount: objective.gradedCount + (aiScore !== null ? aiQuestions.length : 0),
    hasPendingAiQuestions: false,
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ────────────────────────────────────────────────────────────────────────────────

/** Является ли вопрос AI-текстовым (short/long/text с textMatchMode='ai'). */
function isAiTextQuestion(q: Question): boolean {
  const textTypes = ["short", "long", "text"]
  return textTypes.includes(q.answerType) && q.textMatchMode === "ai"
}

/** Подготовить вопросы и маппинг ответов из lessonsJson + answers. */
function prepareQuestions(lessonsJson: unknown, answers: StructuredAnswer[]): {
  taskQuestions: Question[]
  answersByQuestion: Record<string, string>
} {
  const lessons = Array.isArray(lessonsJson) ? (lessonsJson as unknown[]) : []
  const taskQuestions = collectTaskQuestions(
    lessons as { blocks?: { type?: string; questions?: Question[] }[] }[],
  )

  const answersByQuestion: Record<string, string> = {}
  for (const a of answers) {
    if (a.questionId) answersByQuestion[a.questionId] = a.value
  }

  return { taskQuestions, answersByQuestion }
}
