// R2: реальные кандидаты «Резерва» — все по компании со стадией talent_pool.
// Раньше страница Резерва была на mock; этот эндпоинт даёт настоящие данные.
import { NextResponse } from "next/server"
import { and, eq, desc, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select({
        id:           candidates.id,
        name:         candidates.name,
        source:       candidates.source,
        aiScore:      candidates.aiScore,
        resumeScore:  candidates.resumeScore,
        score:        candidates.score,
        email:        candidates.email,
        phone:        candidates.phone,
        telegram:     candidates.telegramUsername,
        updatedAt:    candidates.updatedAt,
        vacancyTitle: vacancies.title,
        companyName:  companies.name,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(and(
        eq(vacancies.companyId, user.companyId),
        eq(candidates.stage, "talent_pool"),
        isNull(vacancies.deletedAt),
      ))
      .orderBy(desc(candidates.updatedAt))
    return NextResponse.json({ candidates: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
