import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions, type PostDemoSettings } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { scoreTestSubmission } from "@/lib/ai-score-test"
import { scheduleTestAfterMessage } from "@/lib/messaging/test-after-message"

const MIN_ANSWER_LEN = 10
const DEFAULT_PASSING_SCORE = 70

// Приём ответа кандидата на тестовое задание. Token — единственный ключ.
// Этап 1: только текстовый ответ (file_url зарезервирован).
// Этап 2: AI-скоринг ответа (Haiku) + ветвление стадии в auto-режиме +
// опциональное «сообщение после теста». Скоринг идёт fire-and-forget
// (как AI-скоринг демо в /api/public/demo/[token]/answer) — кандидат не ждёт
// ответа модели; стадия/score дозаполняются фоном.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const body = await req.json().catch(() => ({})) as { answerText?: unknown }

    const answerText = typeof body.answerText === "string" ? body.answerText.trim() : ""
    if (answerText.length < MIN_ANSWER_LEN) {
      return apiError(`Ответ слишком короткий (минимум ${MIN_ANSWER_LEN} символов)`, 400)
    }

    const [candidate] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (!candidate) return apiError("Кандидат не найден", 404)

    const [demo] = await db
      .select({ id: demos.id, postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, candidate.vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)

    // Дедуп: если уже отправлял — не плодим записи.
    const [existing] = await db
      .select({ id: testSubmissions.id })
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, candidate.id))
      .limit(1)
    if (existing) return apiSuccess({ ok: true, alreadySubmitted: true })

    const [inserted] = await db.insert(testSubmissions).values({
      candidateId: candidate.id,
      demoId:      demo?.id ?? null,
      answerText,
    }).returning({ id: testSubmissions.id })

    // Базовая стадия — test_task_done (как в Этапе 1). В auto-режиме фоновый
    // скоринг может переписать её на test_passed/test_failed.
    await db.update(candidates)
      .set({ stage: "test_task_done", updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))

    // Fire-and-forget AI-скоринг (см. void runAbScoring в demo/answer).
    if (inserted?.id) {
      void processTestScoring({
        submissionId: inserted.id,
        candidateId:  candidate.id,
        vacancyId:    candidate.vacancyId,
        answerText,
        settings:     (demo?.postDemoSettings as PostDemoSettings | null) ?? {},
      })
    }

    return apiSuccess({ ok: true })
  } catch (err) {
    console.error("[public/test submit]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// ─── Фоновый скоринг (не блокирует ответ кандидату) ──────────────────────
async function processTestScoring(args: {
  submissionId: string
  candidateId:  string
  vacancyId:    string
  answerText:   string
  settings:     PostDemoSettings
}): Promise<void> {
  const { submissionId, candidateId, vacancyId, answerText, settings } = args

  // Обратная совместимость: undefined → 'assisted'.
  const checkMode = settings.testCheckMode === "auto" || settings.testCheckMode === "manual"
    ? settings.testCheckMode
    : "assisted"

  // manual — AI не запускаем вовсе.
  if (checkMode === "manual") return

  const passingScore = typeof settings.testPassingScore === "number"
    ? settings.testPassingScore
    : DEFAULT_PASSING_SCORE
  const taskText = typeof settings.testTaskInstructions === "string" ? settings.testTaskInstructions : ""

  let score: number
  try {
    const result = await scoreTestSubmission({
      taskText,
      answerText,
      hrPrompt: settings.testAiPrompt,
    })
    score = result.score
    await db.update(testSubmissions)
      .set({ aiScore: result.score, aiReasoning: result.reasoning })
      .where(eq(testSubmissions.id, submissionId))
  } catch (err) {
    // AI не ответил — стадия остаётся test_task_done, HR проверит вручную.
    console.error("[test scoring] failed:", err instanceof Error ? err.message : err)
    return
  }

  // auto: стадия по порогу + сообщение после теста только при прохождении.
  // assisted: стадию решает HR через карточку; сообщение шлётся по «Принять».
  if (checkMode === "auto") {
    const passed = score >= passingScore
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
