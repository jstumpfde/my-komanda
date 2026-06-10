// Карьерная страница компании по пути /jobs/{companySlug} на основном домене.
// Тонкая обёртка: companySlug = companies.subdomain → общий вид CareerPageView
// (см. app/(public)/careers/career-page-view.tsx — единственная реализация;
// первая точка входа — корень поддомена {sub}.company24.pro → /careers?sub=...).
import type { Metadata } from "next"
import {
  CareerNotFound,
  CareerPageView,
  buildBaseUrl,
  buildCareerMetadata,
  loadCareerCompany,
  loadCareerVacancies,
} from "../../careers/career-page-view"
import { getPublicSeoDefaults } from "@/lib/platform/settings"

export const dynamic = "force-dynamic"

function pageUrlFor(companySlug: string): string {
  return `${buildBaseUrl()}/jobs/${companySlug}`
}

export async function generateMetadata(
  { params }: { params: Promise<{ companySlug: string }> },
): Promise<Metadata> {
  const { companySlug } = await params
  const slug = companySlug.trim().toLowerCase()

  const company = await loadCareerCompany(slug)
  if (!company) return { title: "Страница не найдена" }

  const seoDefaults = await getPublicSeoDefaults().catch(() => null)
  return buildCareerMetadata(company, pageUrlFor(slug), seoDefaults?.ogImage)
}

export default async function JobsPage(
  { params }: { params: Promise<{ companySlug: string }> },
) {
  const { companySlug } = await params
  const slug = companySlug.trim().toLowerCase()

  const company = await loadCareerCompany(slug)
  if (!company) return <CareerNotFound sub={slug} />

  const vacs = await loadCareerVacancies(company.id)

  return <CareerPageView company={company} vacs={vacs} pageUrl={pageUrlFor(slug)} />
}
