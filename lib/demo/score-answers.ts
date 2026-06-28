/**
 * Скоринг ответов кандидата на task-вопросы демо.
 *
 * Читает все demos вакансии (kind='demo' OR kind LIKE 'block:%'),
 * собирает вопросы type="task", фильтрует view-маркеры из anketa_answers,
 * и вызывает AI для оценки ответов против aiCriteria каждого вопроса.
 *
 * Результат пишется в ОТДЕЛЬНЫЕ колонки (НЕ ai_score — туда пишут v1/v2-скоринг
 * резюме, была бы гонка fire-and-forget):
 *   candidates.demo_answers_score   — общий балл 0-100
 *   candidates.demo_answers_details — [{questionText, awarded, max, comment}]
 *
 * Если реальных ответов нет — возвращает null, ничего не пишет.
 */

import { eq, and, like, or } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { candidates, demos } from "@/lib/db/schema"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import {
  buildBlockResolver,
  renderAnswerValue,
} from "@/lib/demo/resolve-questions"

// Cloned from ai-score-candidate-v2 — same proxy/model pattern
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

function parseJsonFromText<T>(text: string): T {
  // Убираем markdown-ограждения ```json ... ```
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const start = t.indexOf("{")
  if (start === -1) throw new Error("AI не вернул JSON")
  // Находим сбалансированную закрывающую скобку первого объекта (устойчиво к
  // тексту/заметкам после JSON и к скобкам внутри строк).
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < t.length; i++) {
    const ch = t[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === "{") {
      depth++
    } else if (ch === "}") {
      depth--
      if (depth === 0) return JSON.parse(t.slice(start, i + 1)) as T
    }
  }
  throw new Error("AI вернул незакрытый JSON")
}

export interface AnswerQuestionBreakdown {
  questionText: string
  awarded: number
  max: number
  comment: string
}

export interface ScoreDemoAnswersResult {
  score: number
  breakdown: AnswerQuestionBreakdown[]
}

export interface ScoreDemoAnswersArgs {
  candidateId: string
  vacancyId: string
  /** Пропустить если балл уже есть (candidates.ai_score != null). */
  skipIfScored?: boolean
}

/**
 * Оцениваем ответы кандидата на квалификационные вопросы демо.
 * Возвращает null если нет реальных ответов (не вызывает AI).
 */
export async function scoreDemoAnswers(
  args: ScoreDemoAnswersArgs,
): Promise<ScoreDemoAnswersResult | null> {
  const { candidateId, vacancyId, skipIfScored } = args

  const [candidate] = await db
    .select({
      id:               candidates.id,
      anketaAnswers:    candidates.anketaAnswers,
      demoAnswersScore: candidates.demoAnswersScore,
    })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
    .limit(1)

  if (!candidate) throw new Error("Кандидат не найден")
  if (skipIfScored && candidate.demoAnswersScore != null) return null

  // Загружаем все demos вакансии: kind='demo' и kind LIKE 'block:%'
  const demoRows = await db
    .select({ lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(
      and(
        eq(demos.vacancyId, vacancyId),
        or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
      ),
    )

  if (demoRows.length === 0) return null

  const resolver = buildBlockResolver(demoRows.map((r) => r.lessonsJson))

  // Собираем все task-вопросы с aiCriteria из резолвера
  interface TaskQuestion {
    blockId: string
    questionId: string
    text: string
    options: string[]
    points: number
    aiCriteria: string
  }
  const taskQuestions: TaskQuestion[] = []
  for (const [blockId, block] of resolver.entries()) {
    for (const q of block.questions) {
      // Включаем вопрос только если у него есть aiCriteria — иначе нечего оценивать
      if (q.aiCriteria && q.aiCriteria.trim()) {
        taskQuestions.push({
          blockId,
          questionId: q.id,
          text:       q.text,
          options:    q.options,
          points:     typeof q.points === "number" ? q.points : 5,
          aiCriteria: q.aiCriteria.trim(),
        })
      }
    }
  }

  if (taskQuestions.length === 0) return null

  // Индексируем ответы кандидата по blockId (берём последний ответ для блока)
  const rawAnswers: Array<{ blockId?: string; answer?: unknown }> = Array.isArray(candidate.anketaAnswers)
    ? (candidate.anketaAnswers as Array<{ blockId?: string; answer?: unknown }>)
    : []

  // Группируем все ответы по blockId
  const answersByBlock = new Map<string, unknown[]>()
  for (const entry of rawAnswers) {
    const bid = entry?.blockId
    if (typeof bid !== "string" || !bid) continue
    const list = answersByBlock.get(bid) ?? []
    list.push(entry.answer)
    answersByBlock.set(bid, list)
  }

  // Для каждого task-вопроса находим реальный ответ (не view-маркер)
  interface AnsweredQuestion {
    question: TaskQuestion
    renderedAnswer: string
  }
  const answeredQuestions: AnsweredQuestion[] = []

  for (const q of taskQuestions) {
    const blockAnswers = answersByBlock.get(q.blockId)
    if (!blockAnswers || blockAnswers.length === 0) continue

    // Проверяем все записи для блока, берём первый реальный ответ
    for (const rawAnswer of blockAnswers) {
      // Фильтр view-маркеров: объект с только viewed/viewedAt/timeSpent — пропускаем
      if (rawAnswer && typeof rawAnswer === "object" && !Array.isArray(rawAnswer)) {
        const o = rawAnswer as Record<string, unknown>
        const meaningfulKeys = Object.keys(o).filter(
          (k) => k !== "viewed" && k !== "viewedAt" && k !== "timeSpent",
        )
        if (meaningfulKeys.length === 0) continue

        // Ответ блока — объект, ключ = questionId
        if (q.questionId in o) {
          const val = o[q.questionId]
          const rendered = renderAnswerValue(val, q.options)
          if (rendered && rendered.trim()) {
            answeredQuestions.push({ question: q, renderedAnswer: rendered.trim() })
            break
          }
          continue
        }

        // Плоский объект (медиа) — берём как есть
        const rendered = renderAnswerValue(rawAnswer, q.options)
        if (rendered && rendered.trim()) {
          answeredQuestions.push({ question: q, renderedAnswer: rendered.trim() })
          break
        }
      } else {
        // Строка или скаляр
        const rendered = renderAnswerValue(rawAnswer, q.options)
        if (rendered && rendered.trim()) {
          answeredQuestions.push({ question: q, renderedAnswer: rendered.trim() })
          break
        }
      }
    }
  }

  // Нет реальных ответов — не вызываем AI
  if (answeredQuestions.length === 0) return null

  // Формируем промпт для AI
  const totalMaxPoints = answeredQuestions.reduce((s, aq) => s + aq.question.points, 0)

  const questionsBlock = answeredQuestions.map((aq, i) => {
    return [
      `Вопрос ${i + 1}: ${aq.question.text}`,
      `Критерий оценки: ${aq.question.aiCriteria}`,
      `Максимальный балл: ${aq.question.points}`,
      `Ответ кандидата: ${aq.renderedAnswer}`,
    ].join("\n")
  }).join("\n\n")

  const prompt = `Ты — строгий HR-аналитик. Оцени ответы кандидата на квалификационные вопросы демо.

Для каждого вопроса:
- Сопоставь ответ с критерием оценки
- Присвой баллы от 0 до максимума (дробные допускаются)
- Дай короткий (1-2 предложения) комментарий на русском

${questionsBlock}

Верни JSON строго в формате:
{
  "questions": [
    {
      "questionText": "...",
      "awarded": 3,
      "max": 5,
      "comment": "..."
    }
  ]
}

Итоговый балл будет посчитан как сумма awarded / сумма max × 100. Будь объективен и строг.`

  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1500,
    temperature: 0,
    messages:   [{ role: "user", content: prompt }],
  })

  const textBlock = msg.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не ответил на оценку ответов демо")
  }

  const parsed = parseJsonFromText<{ questions: Array<{ questionText: string; awarded: number; max: number; comment: string }> }>(
    textBlock.text,
  )

  const breakdown: AnswerQuestionBreakdown[] = (parsed.questions ?? []).map((item) => ({
    questionText: item.questionText ?? "",
    awarded:      Math.max(0, Number(item.awarded) || 0),
    max:          Math.max(1, Number(item.max) || 1),
    comment:      item.comment ?? "",
  }))

  const sumAwarded = breakdown.reduce((s, b) => s + b.awarded, 0)
  const sumMax = breakdown.reduce((s, b) => s + b.max, 0)
  const score = sumMax > 0 ? Math.max(0, Math.min(100, Math.round((sumAwarded / sumMax) * 100))) : 0

  // Запись в БД — в свои колонки (не ai_score, чтобы не было гонки с v1/v2).
  await db.update(candidates).set({
    demoAnswersScore:   score,
    demoAnswersDetails: breakdown,
  }).where(eq(candidates.id, candidateId))

  return { score, breakdown }
}
