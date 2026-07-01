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
  let slogan = ""

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
          brandSlogan: companies.brandSlogan,
        })
        .from(vacancies)
        .innerJoin(companies, eq(vacancies.companyId, companies.id))
        .where(eq(vacancies.id, cand.vacancyId))
        .limit(1)
      if (v) {
        vacancyTitle = v.title?.trim() || vacancyTitle
        companyName = (v.brandName || v.name || "").trim()
        slogan = (v.brandSlogan || "").trim()
      }
    }
  } catch {
    // Фолбэк на нейтральное превью без обращения к БД.
  }

  // Заголовок = вакансия + бренд (оба — редактируемые поля). Описание превью =
  // ТОЛЬКО слоган компании (видимое редактируемое поле Настройки → Брендинг).
  // Никаких вшитых фраз («Отклик на вакансию…», CTA) — см. правило no-hidden-hardcoded-text.
  const title = companyName ? `${vacancyTitle} — ${companyName}` : vacancyTitle
  const description = slogan

  return {
    title,
    description,
    // Кандидатские токен-ссылки не индексируем.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      ...(companyName ? { siteName: companyName } : {}),
      // Без og:image: hh/мессенджеры игнорируют заявленные 256×256 и рисуют
      // огромный баннер из реального файла логотипа. Гасим картинку совсем —
      // превью схлопывается в компактную текстовую карточку (вакансия + бренд +
      // слоган). Пустой массив также глушит платформенный og:image из layout.
      images: [],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [],
    },
  }
}
