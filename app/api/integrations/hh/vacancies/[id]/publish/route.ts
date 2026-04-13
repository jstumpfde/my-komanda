import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies, hhTokens, hhVacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { HHClient, HHMockClient, type HHVacancyPayload } from "@/lib/hh/client"

// Map city names to hh.ru area IDs (most common Russian cities)
const CITY_TO_HH_AREA: Record<string, string> = {
  "Москва": "1",
  "Санкт-Петербург": "2",
  "Екатеринбург": "3",
  "Новосибирск": "4",
  "Казань": "88",
  "Нижний Новгород": "66",
  "Краснодар": "53",
  "Самара": "78",
  "Уфа": "99",
  "Ростов-на-Дону": "76",
  "Воронеж": "26",
  "Пермь": "72",
  "Омск": "68",
  "Красноярск": "54",
  "Волгоград": "24",
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireCompany()
    const vacancyId = params.id

    // Get vacancy
    const vacancyRows = await db
      .select()
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    const vacancy = vacancyRows[0]
    if (!vacancy || vacancy.companyId !== user.companyId) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    // Parse body
    const body = await req.json().catch(() => ({}))
    const {
      salaryFrom,
      salaryTo,
      salaryCurrency = "RUR",
      salaryGross = false,
      schedule = "fullDay",
    } = body

    // Check if already published
    const existingHhVac = await db
      .select()
      .from(hhVacancies)
      .where(eq(hhVacancies.localVacancyId, vacancyId))
      .limit(1)

    // Check if token exists
    const tokenRows = await db
      .select()
      .from(hhTokens)
      .where(eq(hhTokens.companyId, user.companyId))
      .limit(1)

    const areaId = CITY_TO_HH_AREA[vacancy.city ?? "Москва"] ?? "1"

    let hhVacancyId: string
    let status = "active"

    if (!tokenRows[0] || process.env.NODE_ENV === "development") {
      // Mock mode
      const mock = new HHMockClient(user.companyId)
      const result = await mock.publishVacancy(vacancyId, {} as HHVacancyPayload)
      hhVacancyId = result.hh_id
    } else {
      const tokenRow = tokenRows[0]
      const payload: HHVacancyPayload = {
        name: vacancy.title,
        description: vacancy.descriptionJson
          ? JSON.stringify(vacancy.descriptionJson)
          : vacancy.title,
        area: { id: areaId },
        employer: { id: tokenRow.employerId ?? "" },
        schedule: { id: schedule },
        ...(salaryFrom || salaryTo
          ? {
              salary: {
                from: salaryFrom || undefined,
                to: salaryTo || undefined,
                currency: salaryCurrency,
                gross: salaryGross,
              },
            }
          : {}),
      }

      const client = new HHClient(user.companyId)
      const result = await client.publishVacancy(vacancyId, payload)
      hhVacancyId = result.hh_id
    }

    // Save or update hh_vacancies record
    if (existingHhVac[0]) {
      await db
        .update(hhVacancies)
        .set({
          hhVacancyId,
          status,
          syncedAt: new Date(),
        })
        .where(eq(hhVacancies.localVacancyId, vacancyId))
    } else {
      await db.insert(hhVacancies).values({
        companyId: user.companyId,
        localVacancyId: vacancyId,
        hhVacancyId,
        title: vacancy.title,
        status,
      })
    }

    return NextResponse.json({ hh_id: hhVacancyId, status })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH publish]", err)
    return NextResponse.json({ error: "Ошибка публикации" }, { status: 500 })
  }
}
