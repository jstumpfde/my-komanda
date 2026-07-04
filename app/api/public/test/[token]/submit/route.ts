import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions, vacancies, type PostDemoSettings } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { processTestScoring, buildTestAiText } from "@/lib/ai-score-test"
import {
  scoreObjective,
  collectTaskQuestions,
  type StructuredAnswer,
  type ObjectiveResult,
} from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"
// Воронка v2: хук завершения теста (только при funnelV2RuntimeEnabled=true)
import { onTestSubmitted } from "@/lib/funnel-v2/stage-completion-handler"

const MIN_ANSWER_LEN = 10

// Приём ответа кандидата на тестовое задание. Token — единственный ключ.
//
// Два режима (обратная совместимость):
//   • structuredAnswers[] — кандидат отвечал на вопросы task-блоков (новое).
//   • answerText           — единое текстовое поле (legacy, если у теста нет
//                            структурированных вопросов).
//
// Скоринг:
//   • Объективные вопросы (single/multiple/yesno/sort) считаются В КОДЕ
//     (lib/score-test-objective) — сравнение с эталоном + сумма баллов.
//   • Субъективные (short/long/text) и legacy-текст — через AI (scoreTestSubmission).
//   • Итог: если есть оцениваемые объективные баллы (maxPoints>0) — берём
//     объективный %; при наличии и AI-части — среднее; иначе AI. Сравнивается
//     с passing score.
//
// Скоринг — fire-and-forget (как AI-скоринг демо): кандидат не ждёт модель.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "test-submit")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params
    const body = await req.json().catch(() => ({})) as {
      answerText?: unknown
      structuredAnswers?: unknown
    }

    // ─── Парсим оба формата ────────────────────────────────────────────────
    const structured: StructuredAnswer[] = Array.isArray(body.structuredAnswers)
      ? (body.structuredAnswers as unknown[])
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => ({
            blockId:    typeof a.blockId === "string" ? a.blockId : "",
            questionId: typeof a.questionId === "string" ? a.questionId : "",
            answerType: typeof a.answerType === "string" ? a.answerType : "",
            value:      typeof a.value === "string" ? a.value : String(a.value ?? ""),
          }))
          .filter((a) => a.questionId)
      : []

    const hasStructured = structured.length > 0
    const answerText = typeof body.answerText === "string" ? body.answerText.trim() : ""

    // Валидация: либо непустые структурированные ответы, либо текст ≥ MIN_LEN.
    if (hasStructured) {
      const anyNonEmpty = structured.some((a) => a.value.trim().length > 0)
      if (!anyNonEmpty) {
        return apiError("Ответьте хотя бы на один вопрос", 400)
      }
    } else if (answerText.length < MIN_ANSWER_LEN) {
      return apiError(`Ответ слишком короткий (минимум ${MIN_ANSWER_LEN} символов)`, 400)
    }

    const [candidate] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (!candidate) return apiError("Кандидат не найден", 404)

    const [demo] = await db
      .select({ id: demos.id, lessonsJson: demos.lessonsJson, postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, candidate.vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)

    // Дедуп: если уже ОТПРАВЛЯЛ (submitted_at задан) — не плодим записи.
    // Черновик (submitted_at = null, автосохранение по ходу) — дозаполняем ниже.
    const [existing] = await db
      .select({ id: testSubmissions.id, submittedAt: testSubmissions.submittedAt })
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, candidate.id))
      .orderBy(desc(testSubmissions.submittedAt))
      .limit(1)
    if (existing?.submittedAt) return apiSuccess({ ok: true, alreadySubmitted: true })

    // ─── Объективный скоринг в КОДЕ (синхронно, дёшево) ────────────────────
    const lessons = Array.isArray(demo?.lessonsJson) ? (demo.lessonsJson as any[]) : []
    const taskQuestions: Question[] = collectTaskQuestions(lessons)

    const answersByQuestion: Record<string, string> = {}
    for (const a of structured) answersByQuestion[a.questionId] = a.value

    const objective: ObjectiveResult | null = hasStructured
      ? scoreObjective(taskQuestions, answersByQuestion)
      : null

    // Текст для AI: ВСЕ отвеченные вопросы (текстовые И выборные) с
    // формулировками. Раньше в AI уходили только short/long/text — выборные
    // (single/multiple/yesno/sort) AI не видел, и сигналы из вариантов (каналы
    // продаж, типы заказчиков, ниша, РОП-потенциал и т.п.) не учитывались в
    // оценке. Теперь включаем все ответы; множественный выбор хранится через
    // "|||" (SEP в test-client) — нормализуем в ", " для читаемости промпта.
    let freeText = answerText
    if (hasStructured) {
      const qById = new Map(taskQuestions.map((q) => [q.id, q]))
      const parts: string[] = []
      for (const a of structured) {
        const val = a.value.trim()
        if (!val) continue
        const q = qById.get(a.questionId)
        const readable = val.split("|||").map((s) => s.trim()).filter(Boolean).join(", ")
        parts.push(`${q?.text || "Вопрос"}: ${readable}`)
      }
      freeText = parts.join("\n\n")
    }

    // Текст для AI = ответы + per-question критерий «ИИ-проверка» (если задан).
    // В карточку HR пишем чистый freeText, а в AI-оценку — обогащённый, чтобы
    // критерий конкретного вопроса реально влиял на балл. Билдер общий с cron
    // test-scoring-retry (lib/ai-score-test.ts) — повторная оценка зависших
    // считается по тем же правилам, что и первичная.
    const aiText = hasStructured ? buildTestAiText(taskQuestions, structured) : freeText

    // Признак состояния AI-скоринга (scoringStatus в answersJson, БЕЗ миграции —
    // переиспользуем существующий jsonb). Решаем заранее по testCheckMode и
    // наличию свободного текста — тот же расчёт, что и в начале processTestScoring,
    // чтобы HR сразу увидел корректный статус, не дожидаясь фонового тика.
    const settingsForStatus = (demo?.postDemoSettings as PostDemoSettings | null) ?? {}
    const checkModeForStatus = settingsForStatus.testCheckMode === "auto" || settingsForStatus.testCheckMode === "manual"
      ? settingsForStatus.testCheckMode
      : "assisted"
    const willRunAi = checkModeForStatus !== "manual" && aiText.trim().length > 0
    const initialScoringStatus: "pending" | "done" | "manual" =
      checkModeForStatus === "manual" ? "manual" : willRunAi ? "pending" : "done"

    const finalValues = {
      // answerText сохраняем для обратной совместимости с карточкой HR
      // (показывает консолидированный текст). Если структурированный тест без
      // текстовых ответов — null.
      answerText:  hasStructured ? (freeText || null) : (answerText || null),
      answersJson: hasStructured
        ? { answers: structured, objective, scoringStatus: initialScoringStatus }
        : { scoringStatus: initialScoringStatus },
      // Объективный балл проставляем сразу (если он есть). AI может дополнить.
      aiScore:     objective && objective.maxPoints > 0 ? objective.score : null,
      // Фиксируем факт отправки — отличает финал от черновика-автосохранения.
      submittedAt: new Date(),
    }
    // Дозаполняем черновик (автосохранение по ходу) ИЛИ создаём новую запись.
    let submissionId: string | undefined
    if (existing) {
      await db.update(testSubmissions).set(finalValues).where(eq(testSubmissions.id, existing.id))
      submissionId = existing.id
    } else {
      const [inserted] = await db.insert(testSubmissions).values({
        candidateId: candidate.id,
        demoId:      demo?.id ?? null,
        ...finalValues,
      }).returning({ id: testSubmissions.id })
      submissionId = inserted?.id
    }

    // Базовая стадия — test_task_done (колонка «Статус» → «Задание сдано»).
    // В auto-режиме скоринг переписывает её на test_passed/test_failed.
    await db.update(candidates)
      .set({ stage: "test_task_done", updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))

    // Fire-and-forget скоринг (стадия/AI-балл дозаполняются фоном).
    if (submissionId) {
      void processTestScoring({
        submissionId: submissionId,
        candidateId:  candidate.id,
        vacancyId:    candidate.vacancyId,
        freeText:     aiText,
        objective,
        settings:     (demo?.postDemoSettings as PostDemoSettings | null) ?? {},
      })
    }

    // Воронка v2: если флаг включён и кандидат в v2-воронке — применяем StageRule.
    // Fire-and-forget: ошибка не блокирует ответ кандидату.
    // Объективный балл (0..100) передаём сразу — не ждём AI-скоринга.
    void (async () => {
      try {
        const [vac] = await db
          .select({
            funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled,
            funnelV2StateJson:      candidates.funnelV2StateJson,
          })
          .from(vacancies)
          .innerJoin(candidates, eq(candidates.vacancyId, vacancies.id))
          .where(eq(candidates.id, candidate.id))
          .limit(1)
        if (vac?.funnelV2RuntimeEnabled && vac?.funnelV2StateJson) {
          // Передаём объективный балл если есть (иначе onTestSubmitted посчитает сам)
          const objectiveScore = objective && objective.maxPoints > 0 ? objective.score : undefined
          await onTestSubmitted(candidate.id, structured, objectiveScore)
        }
      } catch (err) {
        console.error("[test/submit] v2-хук onTestSubmitted упал:", err instanceof Error ? err.message : err)
      }
    })()

    return apiSuccess({ ok: true })
  } catch (err) {
    console.error("[public/test submit]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
