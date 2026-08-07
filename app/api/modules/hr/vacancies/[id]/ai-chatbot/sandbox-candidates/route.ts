import { NextRequest } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { PLATFORM_STAGES, type StageSlug } from "@/lib/stages"

// Группа 37: короткий список кандидатов вакансии для песочницы AI чат-бота
// («Тестировать от лица кандидата»). Только id/имя/стадия — read-only,
// первые 50 по updatedAt. Изоляция тенанта: вакансия сверяется с
// companyId текущей сессии, кандидаты выбираются строго по её id.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vacancy) return apiError("Вакансия не найдена", 404)

    const rows = await db
      .select({ id: candidates.id, name: candidates.name, stage: candidates.stage })
      .from(candidates)
      .where(eq(candidates.vacancyId, id))
      .orderBy(desc(candidates.updatedAt))
      .limit(50)

    return apiSuccess({
      candidates: rows.map(r => ({
        id:         r.id,
        name:       r.name,
        stage:      r.stage,
        stageLabel: r.stage ? (PLATFORM_STAGES[r.stage as StageSlug]?.defaultLabel ?? r.stage) : null,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[sandbox-candidates]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
