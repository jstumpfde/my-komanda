import { NextRequest } from "next/server"
import { and, count, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/candidates/stats?vacancyId=...
// Лёгкий endpoint только для метрик шапки страницы вакансии. Не зависит
// от пользовательских фильтров (см. также /vacancies/[id]/candidate-stats —
// он остаётся для legacy шапки, но семантика метрик там другая: pending=hh).
//
//   total           — все кандидаты вакансии (исключая source='preview')
//   openedDemo      — кандидаты с demo_opened_at IS NOT NULL
//   completedAnketa — demo_progress_json содержит блок __anketa__ со status=completed
//   rejected        — стадия 'rejected'
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)
    const vacancyId = url.searchParams.get("vacancyId") ?? url.searchParams.get("vacancy_id")

    if (!vacancyId) return apiError("vacancyId required", 400)

    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    const notPreview = sql`(${candidates.source} IS NULL OR ${candidates.source} <> 'preview')`

    // 4 параллельных COUNT — индекс idx_candidates_vacancy_id покрывает
    // основной predicate, остальные условия применяются in-memory к маленькому
    // (≤ нескольких тысяч строк) набору на одну вакансию.
    const [
      [totalRow],
      [openedRow],
      [anketaRow],
      [rejectedRow],
    ] = await Promise.all([
      db.select({ c: count() }).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        notPreview,
      )),
      db.select({ c: count() }).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        notPreview,
        isNotNull(candidates.demoOpenedAt),
      )),
      db.select({ c: count() }).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        notPreview,
        sql`${candidates.demoProgressJson}->'blocks' @> '[{"blockId":"__anketa__","status":"completed"}]'::jsonb`,
      )),
      db.select({ c: count() }).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        notPreview,
        eq(candidates.stage, "rejected"),
      )),
    ])

    return apiSuccess({
      total:           totalRow?.c ?? 0,
      openedDemo:      openedRow?.c ?? 0,
      completedAnketa: anketaRow?.c ?? 0,
      rejected:        rejectedRow?.c ?? 0,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
