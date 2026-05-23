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

    return apiSuccess(result[0])
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/vacancy/[slug]", err)
    return apiError("Internal server error", 500)
  }
}
