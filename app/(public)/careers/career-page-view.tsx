// Общая реализация карьерной страницы компании — ЕДИНСТВЕННЫЙ вид с двумя
// точками входа:
//   1. app/(public)/careers/page.tsx        — корень поддомена {sub}.company24.pro
//      (middleware переписывает на /careers?sub=...)
//   2. app/(public)/jobs/[companySlug]/page.tsx — путь /jobs/{sub} на основном домене
//
// Серверные компоненты — данные прямо из БД, отдаём ТОЛЬКО публичные поля.
// SEO: JSON-LD (Organization + ItemList + JobPosting на каждую вакансию).
//
// ВАЖНО: фильтр статусов — or('active','published'). У Орлинка статус
// вакансий = 'active' (намеренно, см. CLAUDE.md) — не сужать до 'published'.

import { db } from "@/lib/db"
import { companies, vacancies } from "@/lib/db/schema"
import { and, eq, isNull, or, desc } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Banknote, Briefcase, Building2, Globe, ArrowRight } from "lucide-react"
import { FORMAT_LABELS, EMPLOYMENT_LABELS } from "@/lib/vacancy-types"
import { resolveBrand } from "@/lib/brand-colors"

// ── Типы ──────────────────────────────────────────────────────────────────────

export interface CareerCompany {
  id: string
  name: string | null
  brandName: string | null
  brandSlogan: string | null
  logoUrl: string | null
  website: string | null
  subdomain: string | null
  brandPrimaryColor: string | null
  brandBgColor: string | null
  brandTextColor: string | null
  city: string | null
}

export interface CareerVacancy {
  slug: string
  title: string
  city: string | null
  format: string | null
  employment: string | null
  salaryMin: number | null
  salaryMax: number | null
  createdAt: Date | null
}

// ── Загрузка данных (общая для обеих обёрток) ────────────────────────────────

export async function loadCareerCompany(subdomain: string): Promise<CareerCompany | null> {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      brandName: companies.brandName,
      brandSlogan: companies.brandSlogan,
      logoUrl: companies.logoUrl,
      website: companies.website,
      subdomain: companies.subdomain,
      brandPrimaryColor: companies.brandPrimaryColor,
      brandBgColor: companies.brandBgColor,
      brandTextColor: companies.brandTextColor,
      city: companies.city,
    })
    .from(companies)
    .where(eq(companies.subdomain, subdomain))
    .limit(1)
  return company ?? null
}

export async function loadCareerVacancies(companyId: string): Promise<CareerVacancy[]> {
  return db
    .select({
      slug: vacancies.slug,
      title: vacancies.title,
      city: vacancies.city,
      format: vacancies.format,
      employment: vacancies.employment,
      salaryMin: vacancies.salaryMin,
      salaryMax: vacancies.salaryMax,
      createdAt: vacancies.createdAt,
    })
    .from(vacancies)
    .where(
      and(
        eq(vacancies.companyId, companyId),
        // НЕ менять: 'active' у Орлинка — намеренно (см. CLAUDE.md).
        or(eq(vacancies.status, "active"), eq(vacancies.status, "published")),
        isNull(vacancies.deletedAt),
      ),
    )
    .orderBy(desc(vacancies.createdAt))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildBaseUrl(): string {
  const u = process.env.NEXTAUTH_URL || "https://company24.pro"
  return u.replace(/\/$/, "")
}

function displayNameOf(c: Pick<CareerCompany, "brandName" | "name">): string {
  return c.brandName?.trim() || c.name?.trim() || "Компания"
}

function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min && max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
  if (min) return `от ${min.toLocaleString("ru-RU")} ₽`
  if (max) return `до ${max.toLocaleString("ru-RU")} ₽`
  return null
}

// ── Metadata (общая функция для generateMetadata обеих обёрток) ──────────────

export function buildCareerMetadata(
  company: Pick<CareerCompany, "name" | "brandName" | "brandSlogan" | "logoUrl">,
  pageUrl: string,
  fallbackOgImage?: string | null,
): Metadata {
  const displayName = displayNameOf(company)
  const slogan = company.brandSlogan?.trim() || ""
  const description = slogan
    ? `${displayName} — ${slogan}. Открытые вакансии компании.`
    : `Открытые вакансии компании ${displayName}. Откликнитесь прямо сейчас.`

  // OG-картинка: логотип компании → платформенный fallback → без картинки
  const ogImageUrl = company.logoUrl || fallbackOgImage || null

  return {
    title: `Вакансии — ${displayName}`,
    description,
    openGraph: {
      title: `Вакансии — ${displayName}`,
      description,
      url: pageUrl,
      type: "website",
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: displayName }] } : {}),
    },
    alternates: { canonical: pageUrl },
  }
}

// ── JSON-LD: JobPosting (используется и на /vacancy/[slug]) ──────────────────

export interface JobPostingInput {
  title: string
  url: string
  description?: string | null
  city: string | null
  format: string | null
  employment: string | null
  salaryMin: number | null
  salaryMax: number | null
  createdAt: Date | null
  companyName: string
  companyLogo?: string | null
  companyWebsite?: string | null
}

export function buildJobPostingJsonLd(input: JobPostingInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: input.title,
    url: input.url,
    datePosted: (input.createdAt instanceof Date ? input.createdAt : new Date())
      .toISOString()
      .slice(0, 10),
    hiringOrganization: {
      "@type": "Organization",
      name: input.companyName,
      ...(input.companyLogo ? { logo: input.companyLogo } : {}),
      ...(input.companyWebsite ? { url: websiteHref(input.companyWebsite) } : {}),
    },
  }

  if (input.description?.trim()) {
    ld.description = input.description.trim()
  }

  if (input.format === "remote") {
    ld.jobLocationType = "TELECOMMUTE"
  } else if (input.city) {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: input.city,
        addressCountry: "RU",
      },
    }
  }

  if (input.salaryMin || input.salaryMax) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "RUB",
      value: {
        "@type": "QuantitativeValue",
        ...(input.salaryMin ? { minValue: input.salaryMin } : {}),
        ...(input.salaryMax ? { maxValue: input.salaryMax } : {}),
        unitText: "MONTH",
      },
    }
  }

  if (input.employment) {
    ld.employmentType = input.employment === "full" ? "FULL_TIME" : "PART_TIME"
  }

  return ld
}

// ── Заглушка «не найдено» ─────────────────────────────────────────────────────

export function CareerNotFound({ sub }: { sub?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Страница не найдена</h1>
        <p className="text-slate-500">
          {sub
            ? <>Компания <code className="font-mono">{sub}</code> не найдена.</>
            : "Компания не указана."}
        </p>
      </div>
    </main>
  )
}

// ── Общий вид карьерной страницы ──────────────────────────────────────────────

export function CareerPageView({
  company,
  vacs,
  pageUrl,
}: {
  company: CareerCompany
  vacs: CareerVacancy[]
  pageUrl: string
}) {
  const base = buildBaseUrl()

  const brand = resolveBrand({
    brandPrimaryColor: company.brandPrimaryColor,
    brandBgColor: company.brandBgColor,
    brandTextColor: company.brandTextColor,
  })
  const accentColor = brand.primary
  const bgColor = brand.bg
  const textColor = brand.text

  const displayName = displayNameOf(company)
  const slogan = company.brandSlogan?.trim() || null

  // ── JSON-LD ───────────────────────────────────────────────────────────────
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: displayName,
    ...(slogan ? { description: slogan } : {}),
    ...(company.logoUrl ? { logo: company.logoUrl } : {}),
    ...(company.website ? { url: websiteHref(company.website) } : {}),
    ...(company.city
      ? { address: { "@type": "PostalAddress", addressLocality: company.city, addressCountry: "RU" } }
      : {}),
  }

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Вакансии — ${displayName}`,
    url: pageUrl,
    numberOfItems: vacs.length,
    itemListElement: vacs.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/vacancy/${v.slug}`,
      name: v.title,
    })),
  }

  const jobPostings = vacs.map(v =>
    buildJobPostingJsonLd({
      title: v.title,
      url: `${base}/vacancy/${v.slug}`,
      city: v.city,
      format: v.format,
      employment: v.employment,
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      createdAt: v.createdAt,
      companyName: displayName,
      companyLogo: company.logoUrl,
      companyWebsite: company.website,
    }),
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* JSON-LD: Organization */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      {/* JSON-LD: ItemList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      {/* JSON-LD: JobPosting (по одному на вакансию) */}
      {jobPostings.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}

      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: bgColor, color: textColor }}
      >
        {/* ── Шапка ────────────────────────────────────────────────── */}
        <header className="border-b" style={{ borderColor: `${textColor}15` }}>
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 flex items-center gap-4">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logoUrl}
                alt={displayName}
                className="h-14 w-14 rounded-xl object-contain bg-white/40 shrink-0"
              />
            ) : (
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                {displayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-xl sm:text-2xl font-bold leading-tight"
                  style={{ color: textColor }}
                >
                  {displayName}
                </h1>
                {company.website && (() => {
                  const display = company.website!.replace(/^https?:\/\//i, "").replace(/\/$/, "")
                  return (
                    <a
                      href={websiteHref(company.website!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-90 transition-opacity"
                      style={{ color: textColor }}
                    >
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[180px]">{display}</span>
                    </a>
                  )
                })()}
              </div>
              {slogan && (
                <p className="text-sm opacity-60 mt-0.5">{slogan}</p>
              )}
            </div>
          </div>
        </header>

        {/* ── Основной контент ─────────────────────────────────────── */}
        <main className="flex-1">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10">
            <div className="flex items-baseline gap-2 mb-5">
              <h2 className="text-lg font-semibold" style={{ color: textColor }}>
                Открытые вакансии
              </h2>
              {vacs.length > 0 && (
                <span className="text-sm opacity-50">{vacs.length}</span>
              )}
            </div>

            {vacs.length === 0 ? (
              /* ── Пустое состояние ─────────────────────────────────── */
              <div
                className="rounded-2xl border py-16 text-center"
                style={{ borderColor: `${textColor}15` }}
              >
                <Briefcase
                  className="mx-auto mb-4 w-10 h-10 opacity-20"
                  style={{ color: textColor }}
                />
                <p className="text-base font-medium opacity-60" style={{ color: textColor }}>
                  Сейчас нет открытых вакансий
                </p>
                <p className="text-sm opacity-40 mt-1" style={{ color: textColor }}>
                  Загляните позже — мы обновим список
                </p>
              </div>
            ) : (
              /* ── Список вакансий ──────────────────────────────────── */
              <ul className="space-y-3">
                {vacs.map((v) => {
                  const salary = formatSalary(v.salaryMin, v.salaryMax)
                  return (
                    <li key={v.slug}>
                      <Link
                        href={`/vacancy/${v.slug}`}
                        className="group block rounded-2xl border px-5 py-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: `${textColor}15`,
                          backgroundColor: `${textColor}04`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <h3
                              className="text-base font-semibold leading-snug group-hover:underline"
                              style={{ color: textColor }}
                            >
                              {v.title}
                            </h3>

                            {/* Мета-теги */}
                            {(v.city || v.format || v.employment || salary) && (
                              <div className="flex flex-wrap gap-1.5">
                                {v.city && (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                    style={{ backgroundColor: `${textColor}0d`, color: textColor }}
                                  >
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    {v.city}
                                  </span>
                                )}
                                {v.format && (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                    style={{ backgroundColor: `${textColor}0d`, color: textColor }}
                                  >
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    {FORMAT_LABELS[v.format] || v.format}
                                  </span>
                                )}
                                {v.employment && (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                    style={{ backgroundColor: `${textColor}0d`, color: textColor }}
                                  >
                                    <Briefcase className="w-3 h-3 shrink-0" />
                                    {EMPLOYMENT_LABELS[v.employment] || v.employment}
                                  </span>
                                )}
                                {salary && (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                                  >
                                    <Banknote className="w-3 h-3 shrink-0" />
                                    {salary}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Стрелка-индикатор */}
                          <ArrowRight
                            className="w-5 h-5 shrink-0 opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all mt-0.5"
                            style={{ color: accentColor }}
                          />
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </main>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
          className="border-t py-6 text-center text-xs opacity-40"
          style={{ borderColor: `${textColor}15`, color: textColor }}
        >
          Powered by Company24.pro
        </footer>
      </div>
    </>
  )
}
