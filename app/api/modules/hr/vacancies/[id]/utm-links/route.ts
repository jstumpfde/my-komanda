import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, vacancyUtmLinks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => {
      const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
        ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
        н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
        ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
        ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      }
      return map[c] || c
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// GET — список UTM-ссылок вакансии
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Verify ownership
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

// POST — создать UTM-ссылку
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Verify ownership
    const [vacancy] = await db
      .select({ id: vacancies.id, slug: vacancies.slug })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Vacancy not found", 404)

    const body = await req.json() as {
      source: string
      name: string
    }

    if (!body.source || !body.name?.trim()) {
      return apiError("source and name are required", 400)
    }

    const nameSlug = toSlug(body.name.trim())
    const slug = `${body.source}-${nameSlug}-${Date.now().toString(36)}`

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
