// Публичная «карьерная» страница компании для поддомена {sub}.company24.pro.
// Middleware переписывает корень поддомена сюда (?sub=...). Тонкая обёртка:
// резолв компании по companies.subdomain → общий вид CareerPageView
// (см. career-page-view.tsx — единственная реализация; вторая точка входа —
// /jobs/{companySlug} на основном домене).
import type { Metadata } from "next"
import {
  CareerNotFound,
  CareerPageView,
  buildCareerMetadata,
  loadCareerCompany,
  loadCareerVacancies,
} from "./career-page-view"

export const dynamic = "force-dynamic"

function pageUrlFor(subdomain: string): string {
  return `https://${subdomain}.company24.pro`
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ sub?: string }> },
): Promise<Metadata> {
  const { sub } = await searchParams
  const subdomain = (sub ?? "").trim().toLowerCase()
  if (!subdomain) return { title: "Страница не найдена" }

  const company = await loadCareerCompany(subdomain)
  if (!company) return { title: "Страница не найдена" }

  return buildCareerMetadata(company, pageUrlFor(subdomain))
}

export default async function CareersPage(
  { searchParams }: { searchParams: Promise<{ sub?: string }> },
) {
  const { sub } = await searchParams
  const subdomain = (sub ?? "").trim().toLowerCase()
  if (!subdomain) return <CareerNotFound />

  const company = await loadCareerCompany(subdomain)
  if (!company) return <CareerNotFound sub={subdomain} />

  const vacs = await loadCareerVacancies(company.id)

  return <CareerPageView company={company} vacs={vacs} pageUrl={pageUrlFor(subdomain)} />
}
