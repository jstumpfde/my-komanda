import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos, testSubmissions } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"

const MIN_ANSWER_LEN = 10

// Приём ответа кандидата на тестовое задание. Token — единственный ключ.
// Этап 1: только текстовый ответ (file_url зарезервирован — загрузка файлов
// требует отдельного решения по хранилищу, добавим позже).
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
      .select({ id: demos.id })
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

    await db.insert(testSubmissions).values({
      candidateId: candidate.id,
      demoId:      demo?.id ?? null,
      answerText,
    })

    // Стадия — существующая test_task_done (см. lib/stages.ts).
    await db.update(candidates)
      .set({ stage: "test_task_done", updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true })
  } catch (err) {
    console.error("[public/test submit]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
