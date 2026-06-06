import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyUtmLinks, vacancies } from "@/lib/db/schema"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params

  try {
    // Find link by short code
    const [link] = await db
      .select({
        id: vacancyUtmLinks.id,
        vacancyId: vacancyUtmLinks.vacancyId,
        source: vacancyUtmLinks.source,
        destinationUrl: vacancyUtmLinks.destinationUrl,
        destinationType: vacancyUtmLinks.destinationType,
      })
      .from(vacancyUtmLinks)
      .where(eq(vacancyUtmLinks.slug, code))
      .limit(1)

    if (!link) {
      return NextResponse.redirect(new URL("/", _req.url))
    }

    // Increment clicks
    await db
      .update(vacancyUtmLinks)
      .set({ clicks: sql`${vacancyUtmLinks.clicks} + 1` })
      .where(eq(vacancyUtmLinks.id, link.id))

    let redirectUrl: URL

    if (link.destinationUrl) {
      // External destination (приоритетнее, чем destinationType — это явно
      // указанный HR-ом внешний URL, его трогать не должны).
      redirectUrl = new URL(link.destinationUrl)
    } else if (link.destinationType === "demo" || link.destinationType === "test") {
      // Источник ведёт сразу на демо ИЛИ на тест. Bounce создаёт кандидата под
      // link.vacancyId, ставит cookie и редиректит на /demo/{shortId} или
      // /test/{shortId} (флаг ?to=test). ?ref — аналитика (utm_ref cookie ниже).
      redirectUrl = new URL(`/api/public/source/${link.id}/visit`, _req.url)
      if (link.destinationType === "test") redirectUrl.searchParams.set("to", "test")
    } else {
      // Default: страница описания вакансии (destinationType='vacancy').
      const [vacancy] = await db
        .select({ slug: vacancies.slug })
        .from(vacancies)
        .where(eq(vacancies.id, link.vacancyId))
        .limit(1)

      const vacancySlug = vacancy?.slug || link.vacancyId
      redirectUrl = new URL(`/vacancy/${vacancySlug}`, _req.url)
      redirectUrl.searchParams.set("ref", link.id)
    }

    // Set ref cookie for 30 days
    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set("utm_ref", link.id, {
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    })

    return response
  } catch {
    return NextResponse.redirect(new URL("/", _req.url))
  }
}
