import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies, hhVacancies } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireCompany()
    const hhVacRowId = params.id

    const [hhVac] = await db
      .select()
      .from(hhVacancies)
      .where(and(
        eq(hhVacancies.id, hhVacRowId),
        eq(hhVacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!hhVac) {
      return NextResponse.json({ error: "hh-вакансия не найдена" }, { status: 404 })
    }

    if (hhVac.localVacancyId) {
      return NextResponse.json({ localVacancyId: hhVac.localVacancyId, created: false })
    }

    const [existingLocal] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, user.companyId),
        eq(vacancies.hhVacancyId, hhVac.hhVacancyId),
      ))
      .limit(1)

    let localVacancyId: string
    let created = false

    if (existingLocal) {
      localVacancyId = existingLocal.id
    } else {
      const [newVac] = await db
        .insert(vacancies)
        .values({
          companyId: user.companyId,
          title: hhVac.title,
          slug: `hh-${hhVac.hhVacancyId}-${crypto.randomUUID().slice(0, 8)}`,
          status: "active",
          hhVacancyId: hhVac.hhVacancyId,
          hhUrl: hhVac.url,
          salaryMin: hhVac.salaryFrom,
          salaryMax: hhVac.salaryTo,
          city: hhVac.areaName,
        })
        .returning({ id: vacancies.id })
      localVacancyId = newVac.id
      created = true
    }

    await db
      .update(hhVacancies)
      .set({ localVacancyId })
      .where(eq(hhVacancies.id, hhVacRowId))

    return NextResponse.json({ localVacancyId, created })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH link]", err)
    return NextResponse.json({ error: "Ошибка привязки вакансии" }, { status: 500 })
  }
}
