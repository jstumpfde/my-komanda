import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import {
  scoreObjective,
  collectTaskQuestions,
  type StructuredAnswer,
  type ObjectiveResult,
} from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

// Автосохранение ответов кандидата ПО ХОДУ заполнения теста (черновик).
// Фиксируем ответы у себя, даже если кандидат не нажал «Отправить».
//
// Черновик — запись test_submissions с submitted_at = NULL. Финальный сабмит
// (/submit) дозаполняет ту же запись (ставит submitted_at, запускает AI).
// Здесь AI НЕ запускаем — только объективная автопроверка отвеченных закрытых
// вопросов, чтобы у HR в колонке «Тест» сразу появлялись баллы.
//
// Token — единственный ключ (как в GET/submit). Превью HR (source='preview')
// игнорируем — черновики настоящих кандидатов не засоряем.
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
    const answerText = typeof body.answerText === "string" ? body.answerText : ""

    const [candidate] = await db
      .select({ id: candidates.id, vacancyId: candidates.vacancyId, source: candidates.source })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (!candidate) return apiError("Кандидат не найден", 404)
    // Превью HR — ничего не сохраняем.
    if (candidate.source === "preview") return apiSuccess({ ok: true, skipped: "preview" })

    const [demo] = await db
      .select({ id: demos.id, lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(and(eq(demos.vacancyId, candidate.vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)

    // Объективная автопроверка ТОЛЬКО по отвеченным закрытым вопросам — чтобы
    // частичный балл рос по мере заполнения, а не штрафовал за ещё не отвеченные.
    let objective: ObjectiveResult | null = null
    if (hasStructured) {
      const lessons = Array.isArray(demo?.lessonsJson) ? (demo.lessonsJson as unknown[]) : []
      const allQuestions: Question[] = collectTaskQuestions(lessons as { blocks?: { type?: string; questions?: Question[] }[] }[])
      const answersByQuestion: Record<string, string> = {}
      for (const a of structured) if (a.value.trim()) answersByQuestion[a.questionId] = a.value
      const answeredQuestions = allQuestions.filter((q) => (answersByQuestion[q.id] ?? "").trim().length > 0)
      objective = answeredQuestions.length > 0 ? scoreObjective(answeredQuestions, answersByQuestion) : null
    }

    const draftScore = objective && objective.maxPoints > 0 ? objective.score : null

    // Консолидированный текст для карточки HR (как в submit).
    const freeText = hasStructured
      ? structured
          .filter((a) => a.value.trim())
          .map((a) => a.value.split("|||").map((s) => s.trim()).filter(Boolean).join(", "))
          .join("\n\n")
      : answerText.trim()

    // Существующая запись кандидата (черновик ИЛИ уже отправленная).
    const [existing] = await db
      .select({ id: testSubmissions.id, submittedAt: testSubmissions.submittedAt })
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, candidate.id))
      .orderBy(desc(testSubmissions.submittedAt))
      .limit(1)

    // Уже отправлено — черновик не трогаем (финальные данные важнее).
    if (existing?.submittedAt) return apiSuccess({ ok: true, alreadySubmitted: true })

    const values = {
      answerText:  freeText || null,
      answersJson: hasStructured ? { answers: structured, objective } : null,
      aiScore:     draftScore,
    }

    if (existing) {
      await db.update(testSubmissions).set(values).where(eq(testSubmissions.id, existing.id))
    } else {
      await db.insert(testSubmissions).values({
        candidateId: candidate.id,
        demoId:      demo?.id ?? null,
        submittedAt: null, // черновик
        ...values,
      })
    }

    // Активность кандидата — для фильтра «активны сейчас» (Статус не трогаем).
    await db.update(candidates).set({ lastActivityAt: new Date() }).where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true, score: draftScore })
  } catch (err) {
    console.error("[public/test answer]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
