import type { Metadata } from "next"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies } from "@/lib/db/schema"
import { isShortId } from "@/lib/short-id"

// OG-превью кандидатских ссылок (/test, /demo) для hh-чата и мессенджеров.
// Цель: показывать ВАКАНСИЮ РАБОТОДАТЕЛЯ, а не платформенный логотип Company24.Pro
// и SaaS-описание (они тянулись из глобального layout). Кандидату должно
// выглядеть как сообщение от компании-работодателя.
export async function candidateLinkMetadata(token: string): Promise<Metadata> {
  let vacancyTitle = "Анкета кандидата"
  let companyName = ""
  let logoUrl: string | null = null

  try {
    const [cand] = await db
      .select({ vacancyId: candidates.vacancyId })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (cand?.vacancyId) {
      const [v] = await db
        .select({
          title: vacancies.title,
          name: companies.name,
          brandName: companies.brandName,
          logoUrl: companies.logoUrl,
        })
        .from(vacancies)
        .innerJoin(companies, eq(vacancies.companyId, companies.id))
        .where(eq(vacancies.id, cand.vacancyId))
        .limit(1)
      if (v) {
        vacancyTitle = v.title?.trim() || vacancyTitle
        companyName = (v.brandName || v.name || "").trim()
        logoUrl = v.logoUrl
      }
    }
  } catch {
    // Фолбэк на нейтральное превью без обращения к БД.
  }

  const title = companyName ? `${vacancyTitle} — ${companyName}` : vacancyTitle
  const description = companyName
    ? `Отклик на вакансию «${vacancyTitle}» (${companyName}). Заполните короткую анкету по ссылке.`
    : "Заполните короткую анкету, чтобы продолжить отклик."

  return {
    title,
    description,
    // Кандидатские токен-ссылки не индексируем.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      ...(companyName ? { siteName: companyName } : {}),
      // Пустой массив гасит платформенный og:image из layout; если у работодателя
      // есть логотип — показываем его.
      images: logoUrl ? [{ url: logoUrl }] : [],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: logoUrl ? [logoUrl] : [],
    },
  }
}
