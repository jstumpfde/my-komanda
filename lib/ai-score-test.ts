// Этап 2: AI-оценка ответа кандидата на тестовое задание.
//
// Использует ЕДИНЫЙ Claude-клиент проекта (lib/ai/client.ts →
// callClaudeHaikuWithUsage — вариант с usage, нужен для пер-вызовного лога
// стоимости в ai_usage_log), тот же baseURL (claude-proxy) и retry/timeout,
// что и AI-чат-бот. Новый Anthropic-клиент здесь НЕ создаётся.
//
// Возвращает { score: 0-100, reasoning } или бросает ошибку (модель не
// ответила / JSON битый) — caller (processTestScoring ниже) ретраит и
// в конце концов оставляет стадию test_task_done, чтобы HR проверил вручную.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, testSubmissions, vacancies, type PostDemoSettings } from "@/lib/db/schema"
import { scheduleTestAfterMessage } from "@/lib/messaging/test-after-message"
import { resolveOptionPoints, type ObjectiveResult, type StructuredAnswer } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"
import { callClaudeHaikuWithUsage } from "@/lib/ai/client"
import { logAiCall } from "@/lib/ai/usage-log"
import { logAiCallFailure } from "@/lib/ai/failure-log"
import { AI_MODEL_FAST } from "@/lib/ai/models"

const SYSTEM_PROMPT =
  "Ты — опытный HR-эксперт. Оцени ответ кандидата на тестовое задание по шкале " +
  "0-100, где 0 — ответ не по теме/пустой, 100 — образцовый. Будь объективен и " +
  "строг. Ответь СТРОГО одним JSON-объектом без пояснений вокруг: " +
  '{"score": <число 0-100>, "reasoning": "<краткое обоснование на русском, 1-3 предложения>"}.'

// Дефолтные критерии, если HR не задал свой промпт (testAiPrompt).
export const DEFAULT_TEST_AI_PROMPT =
  "Оцени ответ по критериям: соответствие заданию, полнота, качество проработки " +
  "и аргументации, практическая применимость."

export interface TestScoreResult {
  score:     number   // 0-100, целое
  reasoning: string
}

export async function scoreTestSubmission(args: {
  taskText:   string          // текст тестового задания (instructions)
  answerText: string          // ответ кандидата
  hrPrompt?:  string          // критерии оценки от HR (testAiPrompt)
  /** tenantId для ai_usage_log — опционален (не ломаем существующие вызовы). */
  tenantId?:  string | null
}): Promise<TestScoreResult> {
  const hr = args.hrPrompt && args.hrPrompt.trim().length > 0
    ? args.hrPrompt.trim()
    : DEFAULT_TEST_AI_PROMPT

  const prompt = [
    `Критерии оценки (от HR):\n${hr}`,
    `\nТекст тестового задания:\n${args.taskText.trim() || "(задание не указано — оценивай ответ по общему качеству)"}`,
    `\nОтвет кандидата:\n${args.answerText.trim()}`,
    `\nВерни ТОЛЬКО JSON: {"score": <0-100>, "reasoning": "<обоснование>"}.`,
  ].join("\n")

  const { text: raw, usage } = await callClaudeHaikuWithUsage(prompt, SYSTEM_PROMPT, 800)
  if (args.tenantId) {
    void logAiCall({
      tenantId:     args.tenantId,
      action:       "scoring_test",
      model:        AI_MODEL_FAST,
      inputTokens:  usage.input_tokens,
      outputTokens: usage.output_tokens,
    })
  }

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Ответ AI не содержит JSON")
  const parsed = JSON.parse(match[0]) as { score?: unknown; reasoning?: unknown }

  const rawScore = typeof parsed.score === "number" ? parsed.score : Number(parsed.score)
  if (!Number.isFinite(rawScore)) throw new Error("AI вернул нечисловой score")
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : ""

  return { score, reasoning }
}

const DEFAULT_PASSING_SCORE = 70

// Ретрай с backoff для AI-оценки: rate limit / timeout / прокси-осечка не
// должны навсегда оставлять балл null. 3 попытки (первая сразу + 2 повтора),
// паузы растут (3с/10с). Всегда вызывается из fire-and-forget фона — не
// блокирует HTTP-ответ кандидату.
const AI_SCORE_RETRY_DELAYS_MS = [3_000, 10_000]

async function scoreWithRetry(
  args: { taskText: string; answerText: string; hrPrompt?: string; tenantId?: string | null },
): Promise<TestScoreResult | null> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= AI_SCORE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await scoreTestSubmission(args)
    } catch (err) {
      lastErr = err
      console.error(
        `[test scoring] AI failed (attempt ${attempt + 1}/${AI_SCORE_RETRY_DELAYS_MS.length + 1}):`,
        err instanceof Error ? err.message : err,
      )
      const delay = AI_SCORE_RETRY_DELAYS_MS[attempt]
      if (delay != null) await new Promise((r) => setTimeout(r, delay))
    }
  }
  const lastErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr)
  console.error("[test scoring] AI все ретраи исчерпаны:", lastErrMsg)
  // Сторож найма (drizzle/0277): платформенный детектор массового сбоя AI —
  // логируем один раз ПОСЛЕ исчерпания ретраев (не на каждую попытку).
  void logAiCallFailure({ source: "score-test", errorMessage: lastErrMsg, companyId: args.tenantId ?? null })
  return null
}

export type TestScoringStatus = "pending" | "done" | "failed" | "manual"

// Потолок ПРОГОНОВ processTestScoring на одну submission (первичный из
// submit-route + повторные из cron test-scoring-retry). Каждый прогон — до
// 3 AI-попыток. После потолка cron перестаёт подбирать submission (иначе
// вечный ретрай безнадёжной записи жёг бы токены каждые 10 минут); статус
// остаётся 'failed', HR смотрит вручную в профиле → вкладка «Тест».
export const MAX_SCORING_ATTEMPTS = 8

// Читает текущий answersJson и точечно проставляет scoringStatus (и счётчик
// scoringAttempts), не трогая остальные поля (answers/objective, уже
// записанные при submit). Хранится БЕЗ отдельной колонки — переиспользуем
// существующий jsonb test_submissions.answers_json (05.07), чтобы не гонять
// миграцию ради одного статус-поля.
export async function setTestScoringStatus(
  submissionId: string,
  status: TestScoringStatus,
  opts?: { incrementAttempts?: boolean },
): Promise<void> {
  const [row] = await db
    .select({ answersJson: testSubmissions.answersJson })
    .from(testSubmissions)
    .where(eq(testSubmissions.id, submissionId))
    .limit(1)
  const current = (row?.answersJson as Record<string, unknown> | null) ?? {}
  const next: Record<string, unknown> = { ...current, scoringStatus: status }
  if (opts?.incrementAttempts) {
    const prev = typeof current.scoringAttempts === "number" ? current.scoringAttempts : 0
    next.scoringAttempts = prev + 1
  }
  await db.update(testSubmissions)
    .set({ answersJson: next })
    .where(eq(testSubmissions.id, submissionId))
}

// Собирает обогащённый текст для AI-оценки из структурированных ответов:
// формулировка вопроса + ответ кандидата + «подходящие варианты» (✓ HR или
// per-option баллы) + per-question критерий «ИИ-проверка». ЕДИНАЯ точка для
// первичного скоринга (submit-route) и повторного (cron test-scoring-retry) —
// иначе повторная оценка считалась бы без критериев и балл расходился бы
// с первичным путём.
export function buildTestAiText(taskQuestions: Question[], structured: StructuredAnswer[]): string {
  const qById = new Map(taskQuestions.map((q) => [q.id, q]))
  const parts: string[] = []
  for (const a of structured) {
    const val = a.value.trim()
    if (!val) continue
    const q = qById.get(a.questionId)
    // Множественный выбор хранится через "|||" (SEP в test-client) —
    // нормализуем в ", " для читаемости промпта.
    const readable = val.split("|||").map((s) => s.trim()).filter(Boolean).join(", ")
    let line = `${q?.text || "Вопрос"}: ${readable}`
    // Для выборных вопросов даём AI «подходящие варианты» — отмеченные HR
    // зелёным ✓ (correctOptions) ИЛИ варианты с положительным баллом
    // (per-option режим). Так AI судит «подходит/не подходит», в т.ч.
    // ответ «Другое», который баллами не оценить.
    const opts = q?.options ?? []
    const correctIdx = new Set<number>(q?.correctOptions ?? [])
    if (q && (q.answerType === "single" || q.answerType === "multiple")) {
      resolveOptionPoints(q).forEach((p, i) => { if (p > 0) correctIdx.add(i) })
    }
    const correct = [...correctIdx]
      .map((idx) => opts[idx])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    if (correct.length) line += `\n  (подходящие варианты: ${correct.join(", ")})`
    const crit = (q?.aiCriteria || "").trim()
    if (crit) line += `\n  (критерий оценки: ${crit})`
    parts.push(line)
  }
  return parts.join("\n\n")
}

// ─── Фоновый скоринг теста (fire-and-forget, не блокирует ответ кандидату) ──
// Вызывается из app/api/public/test/[token]/submit/route.ts сразу после
// сохранения submission, И из cron test-scoring-retry для зависших
// (scoringStatus pending/failed старше 10 минут) — оба пути используют одну
// и ту же функцию, чтобы поведение (ретраи/статусы/стадия) не расходилось.
export async function processTestScoring(args: {
  submissionId: string
  candidateId:  string
  vacancyId:    string
  freeText:     string
  objective:    ObjectiveResult | null
  settings:     PostDemoSettings
}): Promise<void> {
  const { submissionId, candidateId, vacancyId, freeText, objective, settings } = args

  // Обратная совместимость: undefined → 'assisted'.
  const checkMode = settings.testCheckMode === "auto" || settings.testCheckMode === "manual"
    ? settings.testCheckMode
    : "assisted"

  // manual — AI не запускаем вовсе (объективный балл уже записан при insert,
  // scoringStatus='manual' проставлен синхронно в submit-route).
  if (checkMode === "manual") return

  const passingScore = typeof settings.testPassingScore === "number"
    ? settings.testPassingScore
    : DEFAULT_PASSING_SCORE
  const taskText = typeof settings.testTaskInstructions === "string" ? settings.testTaskInstructions : ""

  const hasObjective = !!objective && objective.maxPoints > 0
  const hasFreeText = freeText.trim().length > 0

  // tenantId для ai_usage_log — компания вакансии (lookup только если реально
  // будем звать AI, чтобы не тратить запрос зря на manual-режим/пустой ответ).
  let tenantId: string | null = null
  if (hasFreeText) {
    const [vac] = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    tenantId = vac?.companyId ?? null
  }

  // Итоговый балл. Приоритет: объективный % (если есть оцениваемые баллы),
  // плюс усреднение с AI при наличии свободного текста. Если нет ни того, ни
  // другого — выходим (стадия test_task_done, HR проверит руками).
  let finalScore: number | null = hasObjective ? objective!.score : null

  if (hasFreeText) {
    const result = await scoreWithRetry({
      taskText,
      answerText: freeText,
      hrPrompt: settings.testAiPrompt,
      tenantId,
    })
    if (result) {
      finalScore = hasObjective
        ? Math.round((objective!.score + result.score) / 2)
        : result.score
      const reasoning = hasObjective
        ? `Автопроверка: ${objective!.gotPoints} из ${objective!.maxPoints} баллов (${objective!.score}%). ${result.reasoning}`
        : result.reasoning
      await db.update(testSubmissions)
        .set({ aiScore: finalScore, aiReasoning: reasoning })
        .where(eq(testSubmissions.id, submissionId))
      await setTestScoringStatus(submissionId, "done")
    } else {
      // Все ретраи исчерпаны — фиксируем провал (+1 к scoringAttempts, по
      // счётчику cron перестанет подбирать безнадёжные записи). НЕ трогаем
      // aiScore, чтобы объективный балл (если был) остался виден в карточке.
      // HR увидит «оцен…» с тултипом про задержку; cron test-scoring-retry
      // подберёт зависшую submission (pending/failed старше 10 минут) и
      // повторит попытку позже.
      await setTestScoringStatus(submissionId, "failed", { incrementAttempts: true })
      finalScore = hasObjective ? objective!.score : null
    }
  } else if (hasObjective) {
    // Только объективные вопросы — фиксируем итог и обоснование, скоринг
    // считается завершённым (AI тут не участвовал).
    await db.update(testSubmissions)
      .set({
        aiScore: objective!.score,
        aiReasoning: `Автопроверка: ${objective!.gotPoints} из ${objective!.maxPoints} баллов (${objective!.score}%).`,
      })
      .where(eq(testSubmissions.id, submissionId))
    await setTestScoringStatus(submissionId, "done")
  } else {
    // Ни свободного текста, ни объективных баллов — оценивать нечего.
    // Помечаем done, чтобы submission не выглядела «зависшей» и cron не
    // подбирал её по кругу (стадия остаётся test_task_done, HR смотрит руками).
    await setTestScoringStatus(submissionId, "done")
  }

  if (finalScore == null) return // нечего оценивать автоматически (или AI провалился без объективного фолбэка)

  // auto: стадия по порогу (колонка «Статус» → прошёл/не прошёл) + сообщение
  // после теста только при прохождении.
  if (checkMode === "auto") {
    const passed = finalScore >= passingScore
    await db.update(candidates)
      .set({ stage: passed ? "test_passed" : "test_failed", updatedAt: new Date() })
      .where(eq(candidates.id, candidateId))

    if (passed && settings.testAfterMessage && settings.testAfterMessage.trim().length > 0) {
      await scheduleTestAfterMessage({
        candidateId,
        vacancyId,
        messageText: settings.testAfterMessage,
      })
    }
  }
}
