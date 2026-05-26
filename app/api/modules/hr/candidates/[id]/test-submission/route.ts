import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, testSubmissions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Ответ кандидата на тестовое задание — для карточки кандидата у HR.
// Tenant-scoped: кандидат должен принадлежать компании пользователя.
// Визуальная секция карточки (с AI-score + Принять/Отклонить) — Этап 2.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [owned] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!owned) return apiError("Кандидат не найден", 404)

    const [submission] = await db
      .select()
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, id))
      .orderBy(desc(testSubmissions.submittedAt))
      .limit(1)

    return apiSuccess({ submission: submission ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hr/candidates/[id]/test-submission]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
