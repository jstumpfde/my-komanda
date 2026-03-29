import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { hhVacancies, vacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({
        id: hhVacancies.id,
        vacancyId: hhVacancies.vacancyId,
        hhVacancyId: hhVacancies.hhVacancyId,
        hhStatus: hhVacancies.hhStatus,
        publishedAt: hhVacancies.publishedAt,
        expiresAt: hhVacancies.expiresAt,
        views: hhVacancies.views,
        responses: hhVacancies.responses,
        updatedAt: hhVacancies.updatedAt,
        vacancyTitle: vacancies.title,
      })
      .from(hhVacancies)
      .innerJoin(vacancies, eq(hhVacancies.vacancyId, vacancies.id))
      .where(eq(vacancies.companyId, user.companyId))

    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH vacancies]", err)
    return NextResponse.json({ error: "Ошибка" }, { status: 500 })
  }
}
