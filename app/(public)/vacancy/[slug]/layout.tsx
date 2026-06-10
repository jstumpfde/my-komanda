// Серверный layout публичной страницы вакансии: SEO-обвязка для клиентского
// page.tsx (его не трогаем). Добавляет JSON-LD JobPosting (Google for Jobs /
// Яндекс) + generateMetadata. Если вакансия не найдена — просто рендерим
// children (клиентская страница сама покажет «Вакансия не найдена»).
import type { Metadata } from "next"
import { db } from "@/lib/db"
import { companies, vacancies } from "@/lib/db/schema"
import { and, eq, isNull, or } from "drizzle-orm"
import {
  buildBaseUrl,
  buildJobPostingJsonLd,
} from "../../careers/career-page-view"
import { getPublicSeoDefaults } from "@/lib/platform/settings"

export const dynamic = "force-dynamic"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// Убрать HTML-теги из описания для JSON-LD/meta description.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

interface PublicVacancyRow {
  slug: string
  title: string
  description: string | null
  descriptionJson: unknown
  city: string | null
  format: string | null
  employment: string | null
  salaryMin: number | null
  salaryMax: number | null
  createdAt: Date | null
  companyName: string | null
  brandName: string | null
  companyLogo: string | null
  companyWebsite: string | null
}

async function loadPublicVacancy(slug: string): Promise<PublicVacancyRow | null> {
  const [row] = await db
    .select({
      slug: vacancies.slug,
      title: vacancies.title,
      description: vacancies.description,
      descriptionJson: vacancies.descriptionJson,
      city: vacancies.city,
      format: vacancies.format,
      employment: vacancies.employment,
      salaryMin: vacancies.salaryMin,
      salaryMax: vacancies.salaryMax,
      createdAt: vacancies.createdAt,
      companyName: companies.name,
      brandName: companies.brandName,
      companyLogo: companies.logoUrl,
      companyWebsite: companies.website,
    })
    .from(vacancies)
    .innerJoin(companies, eq(vacancies.companyId, companies.id))
    .where(
      and(
        isUuid(slug) ? eq(vacancies.id, slug) : eq(vacancies.slug, slug),
        // Тот же фильтр, что и /api/public/vacancy/[slug]: 'active' у Орлинка.
        or(eq(vacancies.status, "active"), eq(vacancies.status, "published")),
        isNull(vacancies.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

function descriptionOf(v: PublicVacancyRow): string {
  const json = (v.descriptionJson ?? null) as { companyDescription?: string } | null
  const raw = (json?.companyDescription?.trim() || v.description || "").trim()
  return stripHtml(raw)
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const v = await loadPublicVacancy(slug)
  if (!v) return { title: "Вакансия не найдена" }

  const companyDisplay = v.brandName?.trim() || v.companyName?.trim() || "Компания"
  const title = `${v.title} — ${companyDisplay}`
  const description = descriptionOf(v).slice(0, 200) ||
    `Вакансия «${v.title}» в компании ${companyDisplay}. Откликнитесь прямо сейчас.`
  const pageUrl = `${buildBaseUrl()}/vacancy/${v.slug}`

  // OG-картинка: логотип компании → платформенный fallback → без картинки
  const seoDefaults = await getPublicSeoDefaults().catch(() => null)
  const ogImageUrl = v.companyLogo || seoDefaults?.ogImage || null

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: companyDisplay }] } : {}),
    },
    alternates: { canonical: pageUrl },
  }
}

export default async function VacancyLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const v = await loadPublicVacancy(slug)
  if (!v) return <>{children}</>

  const companyDisplay = v.brandName?.trim() || v.companyName?.trim() || "Компания"
  const jobPostingJsonLd = buildJobPostingJsonLd({
    title: v.title,
    url: `${buildBaseUrl()}/vacancy/${v.slug}`,
    description: descriptionOf(v),
    city: v.city,
    format: v.format,
    employment: v.employment,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    createdAt: v.createdAt,
    companyName: companyDisplay,
    companyLogo: v.companyLogo,
    companyWebsite: v.companyWebsite,
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />
      {children}
    </>
  )
}
