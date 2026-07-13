/**
 * Скоринг ответов кандидата на task-вопросы демо.
 *
 * Читает все demos вакансии (kind='demo' OR kind LIKE 'block:%'),
 * определяет версию демо кандидата по перекрытию blockId-ов ответов,
 * собирает вопросы type="task" с aiCriteria ТОЛЬКО из этой версии,
 * и вызывает AI для оценки только отвеченных вопросов.
 *
 * Формула ПЕР-БЛОЧНОГО балла: score = round( sum(awarded, неотвеченные=0) /
 * sum(points, все скорируемые ЭТОГО блока) × 100 ). Пишется в demo_block_scores.
 *
 * Формула ЕДИНОГО балла «Анкета» (Вариант Б, решение Юрия 05.07,
 * lib/demo/unified-score.ts): sum(awarded) / sum(max) ПО ВСЕМ answered-блокам
 * (несданные части демо исключены из знаменателя — их блока просто нет).
 * Пока answered-блок один (обычно часть 1) — единый балл совпадает с
 * пер-блочным байт-в-байт (обратная совместимость с гейтами score-gate/
 * second-demo-invite, которые читают demo_answers_score как балл части 1).
 *
 * Результат пишется в ОТДЕЛЬНЫЕ колонки (НЕ ai_score — туда пишут v1/v2-скоринг
 * резюме, была бы гонка fire-and-forget):
 *   candidates.demo_answers_score   — ЕДИНЫЙ балл 0-100 (все answered-части)
 *   candidates.demo_answers_details — конкатенация breakdown всех answered-блоков
 *   candidates.demo_block_scores    — балл + breakdown КАЖДОГО блока отдельно
 *
 * Если реальных ответов нет — возвращает null, ничего не пишет.
 */

import { eq, and, like, or } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { candidates, demos, vacancies } from "@/lib/db/schema"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import {
  buildBlockResolver,
  renderAnswerValue,
} from "@/lib/demo/resolve-questions"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { logAiCall } from "@/lib/ai/usage-log"
import { logAiCallFailure } from "@/lib/ai/failure-log"
import { AI_MODEL_MAIN } from "@/lib/ai/models"
import { computeUnifiedAnketaScore } from "@/lib/demo/unified-score"

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

export interface TaskQuestion {
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
 * Экспортируется — переиспользуется API списка кандидатов для подсчёта
 * partsTotal (сколько демо-блоков вакансии вообще скорируемы), нужного
 * индикатору прогресса частей "N/M" в UI (components/dashboard/list-view.tsx).
 */
export function extractTaskQuestions(lessonsJson: unknown): TaskQuestion[] {
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

  // tenantId для ai_usage_log (пер-блочные AI-вызовы ниже, один вызов на блок).
  const [vacRow] = await db
    .select({ companyId: vacancies.companyId })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  const tenantId = vacRow?.companyId ?? null

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
  // Сколько демо-блоков вакансии вообще СКОРИРУЕМЫ (есть вопросы с aiCriteria) —
  // знаменатель для индикатора прогресса частей "N/M" в UI (partsTotal), НЕ
  // влияет на формулу балла (та использует только answered-блоки из blockScores).
  let scorableBlockCount = 0

  for (const demo of demoRows) {
    const allScorable = extractTaskQuestions(demo.lessonsJson) // весь знаменатель этого блока
    if (allScorable.length === 0) continue
    scorableBlockCount++

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

  let msg: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    msg = await anthropic.messages.create({
      model:      AI_MODEL_MAIN,
      thinking: { type: "disabled" },
      max_tokens: 1500,
      messages:   [{ role: "user", content: prompt }],
    })
  } catch (err) {
    // Сторож найма (drizzle/0277): платформенный детектор массового сбоя AI —
    // логируем и пробрасываем дальше (поведение вызова не меняем).
    const errMsg = err instanceof Error ? err.message : String(err)
    void logAiCallFailure({ source: "score-answers", errorMessage: errMsg, companyId: tenantId ?? null, vacancyId })
    throw err
  }
  void addVacancyTokens(vacancyId, msg.usage)
  if (tenantId) {
    void logAiCall({
      tenantId,
      action:       "scoring_answers",
      model:        AI_MODEL_MAIN,
      inputTokens:  msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
    })
  }

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

  // Единый балл «Анкета» (Вариант Б, решение Юрия 05.07): пока answered-блок
  // ровно один (обычно часть 1) — unified совпадает с mainResult байт-в-байт
  // (то же demoId, тот же breakdown, тот же score). Как только answered-блоков
  // становится ≥2 (часть 2 тоже сдана) — знаменатель пересчитывается ПО ВСЕМ
  // отвеченным вопросам обеих частей (несданные части исключены — их блока
  // просто нет в blockScores). Пишем в ТУ ЖЕ колонку demo_answers_score, чтобы
  // все читатели (список/сортировка/экспорт/гейты) работали без изменений.
  const blockList = demoRows
    .filter((d) => blockScores[d.id])
    .map((d) => ({ demoId: d.id, title: blockScores[d.id].title, score: blockScores[d.id].score, breakdown: blockScores[d.id].breakdown }))
  const unified = computeUnifiedAnketaScore(blockList, scorableBlockCount)
  const finalScore = unified ? unified.score : mainResult.score
  // Единый breakdown = конкатенация breakdown'ов всех answered-блоков в порядке
  // демо (для панели «Оценки»/rescore diagnostics — единообразно с mainResult).
  const finalDetails = blockList.length > 1
    ? blockList.flatMap((b) => b.breakdown)
    : mainResult.breakdown

  // Запись: demo_answers_score/details = единый балл; demo_block_scores = все блоки.
  await db.update(candidates).set({
    demoAnswersScore:   finalScore,
    demoAnswersDetails: finalDetails,
    demoBlockScores:    blockScores,
  }).where(eq(candidates.id, candidateId))

  return { score: finalScore, breakdown: finalDetails }
}
