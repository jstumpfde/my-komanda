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
        // Слоган и сайт компании для публичной страницы вакансии.
        _companyWebsite:   companies.website,
        _companySlogan:    companies.brandSlogan,
        // Описание компании (блок «О компании») для публичной страницы.
        _companyDescription: companies.companyDescription,
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
    // видит название/логотип/слоган/сайт бренд-компании вместо основной.
    // brandCompanyId="" / отсутствует → основная компания, ничего не меняем.
    type BrandCompany = { id: string; name: string; logo?: string; slogan?: string; website?: string; description?: string }
    const { hiringDefaultsJson, _companyWebsite, _companySlogan, _companyDescription, ...row } = result[0] as Record<string, unknown> & {
      hiringDefaultsJson?: { brandCompanies?: BrandCompany[] } | null
      _companyWebsite?: string | null
      _companySlogan?: string | null
      _companyDescription?: string | null
    }

    // Начальные значения — из основной компании.
    let resolvedLogo        = row.companyLogo as string | null ?? null
    let resolvedSlogan      = _companySlogan ?? null
    let resolvedWebsite     = _companyWebsite ?? null
    let resolvedDescription = _companyDescription ?? null

    const anketa = (row.descriptionJson as { anketa?: { brandCompanyId?: string } } | null)?.anketa
    const brandId = anketa?.brandCompanyId
    if (brandId) {
      const brand = hiringDefaultsJson?.brandCompanies?.find(c => c.id === brandId)
      if (brand) {
        if (brand.name?.trim())  row.companyName = brand.name
        if (brand.logo?.trim())  resolvedLogo    = brand.logo
        if (brand.slogan?.trim()) resolvedSlogan  = brand.slogan
        if (brand.website?.trim()) resolvedWebsite = brand.website
        if (brand.description?.trim()) resolvedDescription = brand.description
      }
    }

    // Учитываем vacancy-level override: если включён и в descriptionJson.branding
    // заданы logo/slogan/website/description — они приоритетнее всего.
    const overrideOn = row.brandingOverrideEnabled === true
    if (overrideOn) {
      const vb = ((row.descriptionJson as Record<string, unknown> | null)?.branding ?? {}) as {
        logo?: string; slogan?: string; website?: string; description?: string
      }
      if (vb.logo?.trim())    resolvedLogo    = vb.logo
      if (vb.slogan?.trim())  resolvedSlogan  = vb.slogan
      if (vb.website?.trim()) resolvedWebsite = vb.website
      if (vb.description?.trim()) resolvedDescription = vb.description
    }

    row.companyLogo        = resolvedLogo
    row.companySlogan      = resolvedSlogan
    row.companyWebsite     = resolvedWebsite
    row.companyDescription = resolvedDescription

    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/vacancy/[slug]", err)
    return apiError("Internal server error", 500)
  }
}
