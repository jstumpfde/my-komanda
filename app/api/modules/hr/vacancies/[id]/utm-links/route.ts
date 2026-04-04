import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, vacancyUtmLinks, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

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

    const body = await req.json() as { source: string; name: string }

    if (!body.source || !body.name?.trim()) {
      return apiError("source and name are required", 400)
    }

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
      })
      .returning()

    return apiSuccess(link, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
