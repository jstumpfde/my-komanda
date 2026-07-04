// GET/POST /api/cron/test-scoring-retry
// Страховочный подбор зависших AI-скорингов теста: processTestScoring
// (lib/ai-score-test.ts) уже ретраит с backoff внутри своего fire-and-forget
// вызова из app/api/public/test/[token]/submit/route.ts, но если и это не
// помогло (rate limit держится дольше пары минут, прокси лежит, процесс убит
// pm2 reload ДО первого апдейта) — scoringStatus остаётся 'pending' или
// 'failed', а балл null НАВСЕГДА, без индикации причины HR.
//
// Этот cron подбирает submissions со scoringStatus IN ('pending','failed'),
// submitted_at старше STALE_MINUTES и scoringAttempts < MAX_SCORING_ATTEMPTS
// (потолок прогонов — иначе безнадёжная запись жгла бы токены каждые 10 минут
// вечно), и запускает processTestScoring ещё раз. Текст для AI пересобирается
// тем же билдером buildTestAiText, что и при первичном скоринге (с
// per-question критериями «ИИ-проверка») — балл не расходится с основным путём.
// Бюджет времени RUN_BUDGET_MS не даёт прогону пережить интервал crontab
// (наложение прогонов = двойной скоринг одной submission). Лог — в cron_runs.
// Защищён X-Cron-Secret.
//
// Crontab на сервере (раз в ~10 минут):
//   */10 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/test-scoring-retry >> /var/log/test-scoring-retry.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNotNull, lte, sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions, type PostDemoSettings } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { processTestScoring, buildTestAiText, MAX_SCORING_ATTEMPTS } from "@/lib/ai-score-test"
import { collectTaskQuestions, type ObjectiveResult, type StructuredAnswer } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

const CRON_NAME     = "test-scoring-retry"
const MAX_PER_RUN   = 20
const STALE_MINUTES = 10
// Мягкий бюджет одного прогона: при лежащем AI один processTestScoring может
// висеть до ~2 минут (3 попытки × 30с таймаут + backoff'ы) — без бюджета
// прогон из 20 записей пережил бы интервал crontab и наложился на следующий.
const RUN_BUDGET_MS = 120_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const startedAt = Date.now()
  try {
    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60 * 1000)

    // scoringStatus/scoringAttempts живут в answers_json (jsonb, без отдельной
    // колонки — см. комментарий в lib/db/schema.ts у test_submissions.answersJson).
    const due = await db
      .select({
        id:          testSubmissions.id,
        candidateId: testSubmissions.candidateId,
        demoId:      testSubmissions.demoId,
        answerText:  testSubmissions.answerText,
        answersJson: testSubmissions.answersJson,
      })
      .from(testSubmissions)
      .where(and(
        isNotNull(testSubmissions.submittedAt),
        lte(testSubmissions.submittedAt, staleBefore),
        sql`(${testSubmissions.answersJson} ->> 'scoringStatus') IN ('pending', 'failed')`,
        sql`coalesce((${testSubmissions.answersJson} ->> 'scoringAttempts')::int, 0) < ${MAX_SCORING_ATTEMPTS}`,
      ))
      .orderBy(testSubmissions.submittedAt)
      .limit(MAX_PER_RUN)

    let retried = 0
    let skippedBudget = 0
    const errors: string[] = []

    for (const row of due) {
      // Бюджет исчерпан — остальных подберёт следующий прогон (они всё ещё
      // pending/failed и старше STALE_MINUTES).
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        skippedBudget = due.length - retried - errors.length
        break
      }
      try {
        const [cand] = await db
          .select({ id: candidates.id, vacancyId: candidates.vacancyId })
          .from(candidates)
          .where(eq(candidates.id, row.candidateId))
          .limit(1)
        if (!cand) continue // кандидат удалён (152-ФЗ/корзина) — нечего оценивать

        // Настройки проверки (testCheckMode/passingScore/prompt) + структура
        // вопросов (lessonsJson, для пересборки AI-текста с критериями):
        // привязанный demoId, если жив, иначе свежий kind='test' вакансии —
        // тот же fallback-порядок, что и в submit-route.
        type LessonsArg = Parameters<typeof collectTaskQuestions>[0]
        let settings: PostDemoSettings = {}
        let lessons: LessonsArg = []
        let demoFound = false
        if (row.demoId) {
          const [d] = await db
            .select({ postDemoSettings: demos.postDemoSettings, lessonsJson: demos.lessonsJson })
            .from(demos)
            .where(eq(demos.id, row.demoId))
            .limit(1)
          if (d) {
            demoFound = true
            settings = (d.postDemoSettings as PostDemoSettings | null) ?? {}
            lessons = Array.isArray(d.lessonsJson) ? (d.lessonsJson as LessonsArg) : []
          }
        }
        if (!demoFound) {
          const [d] = await db
            .select({ postDemoSettings: demos.postDemoSettings, lessonsJson: demos.lessonsJson })
            .from(demos)
            .where(and(eq(demos.vacancyId, cand.vacancyId), eq(demos.kind, "test")))
            .orderBy(desc(demos.updatedAt))
            .limit(1)
          if (d) {
            settings = (d.postDemoSettings as PostDemoSettings | null) ?? {}
            lessons = Array.isArray(d.lessonsJson) ? (d.lessonsJson as LessonsArg) : []
          }
        }

        const answersJson = row.answersJson as {
          answers?: StructuredAnswer[]
          objective?: ObjectiveResult | null
        } | null
        const objective = answersJson?.objective ?? null
        const structured = Array.isArray(answersJson?.answers) ? answersJson!.answers! : []

        // Свободный текст для повторной AI-оценки — тем же билдером, что и
        // первичный путь (вопрос + ответ + подходящие варианты + критерий
        // «ИИ-проверка»). Legacy-тест без структурированных ответов —
        // консолидированный answer_text.
        const taskQuestions: Question[] = collectTaskQuestions(lessons)
        const freeText = structured.length > 0
          ? buildTestAiText(taskQuestions, structured)
          : (row.answerText ?? "")

        // processTestScoring сам разрулит все случаи: пустой freeText без
        // объективных баллов → пометит 'done' (нечего оценивать, больше не
        // подбираем); провал AI → 'failed' + scoringAttempts+1 (потолок
        // MAX_SCORING_ATTEMPTS отсекает вечный ретрай).
        await processTestScoring({
          submissionId: row.id,
          candidateId:  cand.id,
          vacancyId:    cand.vacancyId,
          freeText,
          objective,
          settings,
        })
        retried++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${row.id}: ${msg}`)
        console.error("[test-scoring-retry] failed", row.id, msg)
      }
    }

    const metadata = { due: due.length, retried, skippedBudget, errors: errors.length, durationMs: Date.now() - startedAt }
    console.log(JSON.stringify({ tag: "cron/test-scoring-retry", ...metadata, ts: new Date().toISOString() }))
    if (run) await finishCronRun(run.id, errors.length > 0 ? "error" : "ok", metadata, errors[0])
    return NextResponse.json({ ok: true, ...metadata })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[test-scoring-retry] fatal:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
