import { NextRequest } from "next/server"
import { eq, and, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"


function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const result = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        description: vacancies.description,
        city: vacancies.city,
        format: vacancies.format,
        employment: vacancies.employment,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        companyName: companies.name,
        companyLogo: companies.logoUrl,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
        descriptionJson: vacancies.descriptionJson,
        // Группа 38: расширенный брендинг + флаг override.
        brandingJson:             companies.brandingJson,
        brandingOverrideEnabled:  vacancies.brandingOverrideEnabled,
        // O1: список компаний-брендов для резолва выбранной на вакансии.
        hiringDefaultsJson:       companies.hiringDefaultsJson,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(
        and(
          isUuid(slug) ? eq(vacancies.id, slug) : eq(vacancies.slug, slug),
          or(eq(vacancies.status, "active"), eq(vacancies.status, "published")),
          isNull(vacancies.deletedAt),
        ),
      )
      .limit(1)

    if (result.length === 0) {
      return apiError("Вакансия не найдена", 404)
    }

    // O1 мультикомпанийность: если на вакансии выбран бренд (№2+), кандидат
    // видит его название вместо основной компании. brandCompanyId="" / отсутствует
    // → основная компания (companies.name), ничего не меняем. Описание кандидат
    // и так берёт из descriptionJson.companyDescription (блок 4), оно уже под бренд.
    const { hiringDefaultsJson, ...row } = result[0] as Record<string, unknown> & {
      hiringDefaultsJson?: { brandCompanies?: Array<{ id: string; name: string }> } | null
    }
    const anketa = (row.descriptionJson as { anketa?: { brandCompanyId?: string } } | null)?.anketa
    const brandId = anketa?.brandCompanyId
    if (brandId) {
      const brand = hiringDefaultsJson?.brandCompanies?.find(c => c.id === brandId)
      if (brand?.name?.trim()) row.companyName = brand.name
    }

    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/vacancy/[slug]", err)
    return apiError("Internal server error", 500)
  }
}
