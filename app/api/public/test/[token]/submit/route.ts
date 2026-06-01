import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions, type PostDemoSettings } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { scoreTestSubmission } from "@/lib/ai-score-test"
import { scheduleTestAfterMessage } from "@/lib/messaging/test-after-message"
import {
  scoreObjective,
  collectTaskQuestions,
  type StructuredAnswer,
  type ObjectiveResult,
} from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

const MIN_ANSWER_LEN = 10
const DEFAULT_PASSING_SCORE = 70

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
    // критерий конкретного вопроса реально влиял на балл.
    let aiText = freeText
    if (hasStructured) {
      const qById = new Map(taskQuestions.map((q) => [q.id, q]))
      const parts: string[] = []
      for (const a of structured) {
        const val = a.value.trim()
        if (!val) continue
        const q = qById.get(a.questionId)
        const readable = val.split("|||").map((s) => s.trim()).filter(Boolean).join(", ")
        let line = `${q?.text || "Вопрос"}: ${readable}`
        // Для выборных вопросов даём AI «подходящие варианты» — отмеченные HR
        // зелёным ✓ (correctOptions). Так AI судит «подходит/не подходит», в т.ч.
        // ответ «Другое», который баллами не оценить.
        const opts = q?.options ?? []
        const correct = (q?.correctOptions ?? [])
          .map((idx) => opts[idx])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        if (correct.length) line += `\n  (подходящие варианты: ${correct.join(", ")})`
        const crit = (q?.aiCriteria || "").trim()
        if (crit) line += `\n  (критерий оценки: ${crit})`
        parts.push(line)
      }
      aiText = parts.join("\n\n")
    }

    const finalValues = {
      // answerText сохраняем для обратной совместимости с карточкой HR
      // (показывает консолидированный текст). Если структурированный тест без
      // текстовых ответов — null.
      answerText:  hasStructured ? (freeText || null) : (answerText || null),
      answersJson: hasStructured ? { answers: structured, objective } : null,
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

    // Статус (стадию) кандидата НЕ трогаем — факт сдачи фиксируется в
    // test_submissions.submitted_at, а в списке HR это колонка «Тест» (сдан/балл).
    // Fire-and-forget скоринг (AI-балл дозаполняется фоном).
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
  freeText:     string
  objective:    ObjectiveResult | null
  settings:     PostDemoSettings
}): Promise<void> {
  const { submissionId, candidateId, vacancyId, freeText, objective, settings } = args

  // Обратная совместимость: undefined → 'assisted'.
  const checkMode = settings.testCheckMode === "auto" || settings.testCheckMode === "manual"
    ? settings.testCheckMode
    : "assisted"

  // manual — AI не запускаем вовсе (объективный балл уже записан при insert).
  if (checkMode === "manual") return

  const passingScore = typeof settings.testPassingScore === "number"
    ? settings.testPassingScore
    : DEFAULT_PASSING_SCORE
  const taskText = typeof settings.testTaskInstructions === "string" ? settings.testTaskInstructions : ""

  const hasObjective = !!objective && objective.maxPoints > 0
  const hasFreeText = freeText.trim().length > 0

  // Итоговый балл. Приоритет: объективный % (если есть оцениваемые баллы),
  // плюс усреднение с AI при наличии свободного текста. Если нет ни того, ни
  // другого — выходим (стадия test_task_done, HR проверит руками).
  let finalScore: number | null = hasObjective ? objective!.score : null

  if (hasFreeText) {
    try {
      const result = await scoreTestSubmission({
        taskText,
        answerText: freeText,
        hrPrompt: settings.testAiPrompt,
      })
      finalScore = hasObjective
        ? Math.round((objective!.score + result.score) / 2)
        : result.score
      const reasoning = hasObjective
        ? `Автопроверка: ${objective!.gotPoints} из ${objective!.maxPoints} баллов (${objective!.score}%). ${result.reasoning}`
        : result.reasoning
      await db.update(testSubmissions)
        .set({ aiScore: finalScore, aiReasoning: reasoning })
        .where(eq(testSubmissions.id, submissionId))
    } catch (err) {
      console.error("[test scoring] AI failed:", err instanceof Error ? err.message : err)
      // AI упал — остаётся объективный балл (если был), его и используем.
    }
  } else if (hasObjective) {
    // Только объективные вопросы — фиксируем итог и обоснование.
    await db.update(testSubmissions)
      .set({
        aiScore: objective!.score,
        aiReasoning: `Автопроверка: ${objective!.gotPoints} из ${objective!.maxPoints} баллов (${objective!.score}%).`,
      })
      .where(eq(testSubmissions.id, submissionId))
  }

  if (finalScore == null) return // нечего оценивать автоматически

  // auto: Статус (стадию) НЕ меняем — результат теста виден в колонке «Тест»
  // (балл). Сообщение после теста при прохождении — оставляем.
  if (checkMode === "auto") {
    const passed = finalScore >= passingScore
    if (passed && settings.testAfterMessage && settings.testAfterMessage.trim().length > 0) {
      await scheduleTestAfterMessage({
        candidateId,
        vacancyId,
        messageText: settings.testAfterMessage,
      })
    }
  }
}
