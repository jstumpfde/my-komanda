import { NextRequest } from "next/server"
import { and, eq, sql, isNotNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Фасеты фильтра по ВСЕЙ вакансии (не по текущей странице): уникальные города и
// источники со счётчиками. Нужны, чтобы дропдауны «Город»/«Источник» показывали
// все значения вакансии, а не только из загруженных 20-50 кандидатов (#18).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const cityRows = await db
      .select({ city: candidates.city, count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, id), isNotNull(candidates.city), sql`${candidates.city} <> ''`))
      .groupBy(candidates.city)
      .orderBy(desc(sql`count(*)`))

    const sourceRows = await db
      .select({ source: candidates.source, count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, id), isNotNull(candidates.source), sql`${candidates.source} <> ''`))
      .groupBy(candidates.source)
      .orderBy(desc(sql`count(*)`))

    return apiSuccess({
      cities:  cityRows.map(r => ({ city: r.city as string, count: Number(r.count) })),
      sources: sourceRows.map(r => ({ source: r.source as string, count: Number(r.count) })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[candidate-facets]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
