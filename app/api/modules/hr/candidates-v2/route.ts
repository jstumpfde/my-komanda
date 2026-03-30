/**
 * GET /api/modules/hr/candidates-v2?vacancyId=...
 * Список кандидатов компании, опционально фильтр по вакансии.
 */
import { NextRequest, NextResponse } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancyId")

    // Получаем всех кандидатов компании через join с vacancies
    const rows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        phone: candidates.phone,
        city: candidates.city,
        source: candidates.source,
        stage: candidates.stage,
        score: candidates.score,
        token: candidates.token,
        vacancyId: candidates.vacancyId,
        vacancyTitle: vacancies.title,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(
        and(
          eq(vacancies.companyId, companyId),
          vacancyId ? eq(candidates.vacancyId, vacancyId) : undefined,
        )
      )
      .orderBy(desc(candidates.createdAt))

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
