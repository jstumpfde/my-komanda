import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { parsePipeline, type VacancyPipelineV2 } from "@/lib/stages"

// PUT /api/modules/hr/vacancies/[id]/pipeline
// Body: VacancyPipelineV2 (Ф3 рефакторинга воронки 2026-05-10).
// Сохраняется в vacancies.description_json.pipeline; в Ф6 это значение
// читают drawer, kanban, фильтр и hh-sync через lib/stages.ts.
export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) return apiError("Vacancy not found", 404)

    const raw = await req.json().catch(() => null)
    // parsePipeline валидирует структуру: невалидное → дефолт на пресете standard.
    // Гарантирует, что в БД попадают только корректные slug, цвета и hhAction.
    const pipeline: VacancyPipelineV2 = parsePipeline(raw)

    const dj = (existing.descriptionJson as Record<string, unknown> | null) ?? {}
    const newDj = { ...dj, pipeline }

    await db
      .update(vacancies)
      .set({ descriptionJson: newDj, updatedAt: new Date() })
      .where(eq(vacancies.id, id))

    return apiSuccess({ ok: true, pipeline })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
