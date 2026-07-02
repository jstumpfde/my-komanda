/**
 * Скоринг ответов кандидата на task-вопросы демо.
 *
 * Читает все demos вакансии (kind='demo' OR kind LIKE 'block:%'),
 * определяет версию демо кандидата по перекрытию blockId-ов ответов,
 * собирает вопросы type="task" с aiCriteria ТОЛЬКО из этой версии,
 * и вызывает AI для оценки только отвеченных вопросов.
 *
 * Формула: score = round( sum(awarded, неотвеченные=0) / sum(points, все скорируемые) × 100 )
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
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

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
  /** Пропустить если балл уже есть (candidates.demo_answers_score != null). */
  skipIfScored?: boolean
}

interface TaskQuestion {
  blockId: string
  questionId: string
  text: string
  options: string[]
  points: number
  aiCriteria: string
}

interface DemoVersion {
  lessonsJson: unknown
  taskQuestions: TaskQuestion[]
}

/**
 * Строим TaskQuestion[] из одного lessonsJson.
 */
function extractTaskQuestions(lessonsJson: unknown): TaskQuestion[] {
  const result: TaskQuestion[] = []
  const resolver = buildBlockResolver([lessonsJson])
  for (const [blockId, block] of resolver.entries()) {
    for (const q of block.questions) {
      if (q.aiCriteria && q.aiCriteria.trim()) {
        result.push({
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
  return result
}

/**
 * Определяем, к какой версии демо относятся ответы кандидата.
 *
 * Алгоритм: для каждой версии демо считаем, сколько blockId-ов из ответов
 * кандидата совпадает с block-id-ами в этой версии. Версия с наибольшим
 * перекрытием = версия кандидата.
 *
 * Фолбэк:
 * - Если только одна версия — берём её.
 * - Если перекрытие нулевое (нет ни одного совпадения ни в одной) — берём первую.
 */
function pickCandidateDemoVersion(
  versions: DemoVersion[],
  answeredBlockIds: Set<string>,
): DemoVersion {
  if (versions.length === 1) return versions[0]

  let best: DemoVersion = versions[0]
  let bestScore = -1

  for (const version of versions) {
    const blockIdsInVersion = new Set(version.taskQuestions.map((q) => q.blockId))
    let overlap = 0
    for (const bid of answeredBlockIds) {
      if (blockIdsInVersion.has(bid)) overlap++
    }
    if (overlap > bestScore) {
      bestScore = overlap
      best = version
    }
  }

  return best
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
    .select({ id: demos.id, title: demos.title, kind: demos.kind, lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(
      and(
        eq(demos.vacancyId, vacancyId),
        or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
      ),
    )
    .orderBy(demos.sortOrder, demos.createdAt)

  if (demoRows.length === 0) return null

  // Индексируем ответы кандидата по blockId (берём все записи для блока)
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

  // Скорим КАЖДЫЙ демо-блок отдельно (Вариант Б, пер-блочный балл анкеты).
  const blockScores: Record<string, { title: string; score: number; breakdown: AnswerQuestionBreakdown[] }> = {}
  let mainResult: ScoreDemoAnswersResult | null = null

  for (const demo of demoRows) {
    const allScorable = extractTaskQuestions(demo.lessonsJson) // весь знаменатель этого блока
    if (allScorable.length === 0) continue

  // Для каждого scorable-вопроса находим реальный ответ (не view-маркер)
  interface AnsweredQuestion {
    question: TaskQuestion
    renderedAnswer: string
  }
  const answeredQuestions: AnsweredQuestion[] = []

  for (const q of allScorable) {
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

  // Нет реальных ответов на этот блок — пропускаем блок
  if (answeredQuestions.length === 0) continue

  // Отправляем в AI ТОЛЬКО отвеченные вопросы (экономия токенов)
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
    model:      AI_MODEL_MAIN,
    thinking: { type: "disabled" },
    max_tokens: 1500,
    messages:   [{ role: "user", content: prompt }],
  })
  void addVacancyTokens(vacancyId, msg.usage)

  const textBlock = msg.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не ответил на оценку ответов демо")
  }

  const parsed = parseJsonFromText<{ questions: Array<{ questionText: string; awarded: number; max: number; comment: string }> }>(
    textBlock.text,
  )

  // Строим карту AI-результатов по тексту вопроса (AI возвращает их в том же порядке)
  const aiResults = (parsed.questions ?? []).map((item) => ({
    questionText: item.questionText ?? "",
    awarded:      Math.max(0, Number(item.awarded) || 0),
    max:          Math.max(1, Number(item.max) || 1),
    comment:      item.comment ?? "",
  }))

  // Индексируем AI-результаты по позиции (AI отвечает в порядке отправки)
  const answeredIndexMap = new Map<string, typeof aiResults[0]>()
  answeredQuestions.forEach((aq, i) => {
    const aiItem = aiResults[i]
    if (aiItem) answeredIndexMap.set(`${aq.question.blockId}::${aq.question.questionId}`, aiItem)
  })

  // Собираем финальный breakdown по ВСЕМ scorable вопросам версии кандидата:
  // отвеченные — с AI-оценкой; неотвеченные — awarded=0, comment="Не отвечено"
  const breakdown: AnswerQuestionBreakdown[] = allScorable.map((q) => {
    const key = `${q.blockId}::${q.questionId}`
    const aiItem = answeredIndexMap.get(key)
    if (aiItem) {
      return {
        questionText: q.text,
        awarded:      Math.max(0, Math.min(q.points, aiItem.awarded)),
        max:          q.points,
        comment:      aiItem.comment,
      }
    }
    // Неотвеченный вопрос: 0 баллов, учитывается в знаменателе
    return {
      questionText: q.text,
      awarded:      0,
      max:          q.points,
      comment:      "Не отвечено",
    }
  })

  // Знаменатель = сумма points ВСЕХ scorable вопросов версии кандидата
  const sumAwarded = breakdown.reduce((s, b) => s + b.awarded, 0)
  const sumMax     = breakdown.reduce((s, b) => s + b.max, 0)
  const score = sumMax > 0 ? Math.max(0, Math.min(100, Math.round((sumAwarded / sumMax) * 100))) : 0

    // Балл этого блока собран
    blockScores[demo.id] = { title: demo.title, score, breakdown }
    // Основной балл (demo_answers_score/details) = блок kind='demo' (или первый скоренный).
    if (demo.kind === "demo" || mainResult === null) mainResult = { score, breakdown }
  }

  // Ни одного блока с реальными ответами — ничего не пишем.
  if (!mainResult) return null

  // Запись: demo_answers_score/details = основной блок; demo_block_scores = все блоки.
  await db.update(candidates).set({
    demoAnswersScore:   mainResult.score,
    demoAnswersDetails: mainResult.breakdown,
    demoBlockScores:    blockScores,
  }).where(eq(candidates.id, candidateId))

  return mainResult
}
