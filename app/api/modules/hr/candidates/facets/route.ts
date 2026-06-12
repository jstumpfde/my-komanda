import { NextRequest } from "next/server"
import { and, eq, sql, isNotNull, desc, ne, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Глобальные фасеты кандидатов по всей компании: уникальные города и источники
// со счётчиками. Аналог /vacancies/[id]/candidate-facets, но без привязки к
// конкретной вакансии. Используется поп-овером «Фильтр» на /hr/candidates (#18).
export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    // Базовые условия: только кандидаты своей компании, без удалённых и без preview
    const baseConds = and(
      eq(vacancies.companyId, user.companyId),
      or(isNull(candidates.source), ne(candidates.source, "preview")),
      isNull(candidates.deletedAt),
    )

    const cityRows = await db
      .select({ city: candidates.city, count: sql<number>`count(*)::int` })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(baseConds, isNotNull(candidates.city), sql`${candidates.city} <> ''`))
      .groupBy(candidates.city)
      .orderBy(desc(sql`count(*)`))

    const sourceRows = await db
      .select({ source: candidates.source, count: sql<number>`count(*)::int` })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(baseConds, isNotNull(candidates.source), sql`${candidates.source} <> ''`))
      .groupBy(candidates.source)
      .orderBy(desc(sql`count(*)`))

    return apiSuccess({
      cities:  cityRows.map(r => ({ city: r.city as string, count: Number(r.count) })),
      sources: sourceRows.map(r => ({ source: r.source as string, count: Number(r.count) })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[candidates/facets]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
