import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, vacancyUtmLinks, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"

function generateShortCode(companyName: string): string {
  const prefix = (companyName || "k")[0].toLowerCase()
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1)
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let suffix = ""
  for (let i = 0; i < 2; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${year}${month}${suffix}`
}

// GET — список UTM-ссылок вакансии
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Vacancy not found", 404)

    const links = await db
      .select()
      .from(vacancyUtmLinks)
      .where(eq(vacancyUtmLinks.vacancyId, id))

    return apiSuccess(links)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — создать короткую UTM-ссылку
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Vacancy not found", 404)

    const body = await req.json() as {
      source: string
      name: string
      destinationUrl?: string
      destinationType?: string
    }

    if (!body.source || !body.name?.trim()) {
      return apiError("source and name are required", 400)
    }

    const destinationUrl = body.destinationUrl?.trim() || null

    // Enum 'vacancy' | 'demo'. Дефолт 'vacancy' — поведение до этой фичи
    // (см. миграцию 0145 и /v/[code]). Невалидное значение → 400.
    const rawDest = body.destinationType?.trim() || "vacancy"
    if (rawDest !== "vacancy" && rawDest !== "demo") {
      return apiError("destinationType must be 'vacancy' or 'demo'", 400)
    }
    const destinationType = rawDest as "vacancy" | "demo"

    // Get company name for short code prefix
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    // Generate unique short code (retry on collision)
    let slug = ""
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = generateShortCode(company?.name || "")
      const [existing] = await db
        .select({ id: vacancyUtmLinks.id })
        .from(vacancyUtmLinks)
        .where(eq(vacancyUtmLinks.slug, slug))
        .limit(1)
      if (!existing) break
    }

    const [link] = await db
      .insert(vacancyUtmLinks)
      .values({
        vacancyId: id,
        source: body.source,
        name: body.name.trim(),
        slug,
        destinationUrl,
        destinationType,
        createdByUserId: user.id,
      })
      .returning()

    // Audit: дублируем в activity_log для общего трейла (фильтры по
    // user/entity). logActivity сам ловит ошибки внутри (lib/activity-log.ts
    // 20+38), но оборачиваем ещё раз — best-effort, никакая просадка
    // лога не должна влиять на ответ клиенту (Yuri's spec).
    try {
      await logActivity({
        companyId:   user.companyId,
        userId:      user.id,
        action:      "create",
        entityType:  "utm_link",
        entityId:    link.id,
        entityTitle: link.name,
        module:      "hr",
        details: {
          vacancyId:       id,
          source:          link.source,
          destinationType: link.destinationType,
          slug:            link.slug,
        },
        request: req,
      })
    } catch (logErr) {
      console.error("[utm-links POST] activity log failed:",
        logErr instanceof Error ? logErr.message : logErr)
    }

    return apiSuccess(link, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
