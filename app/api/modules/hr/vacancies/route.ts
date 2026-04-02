import { NextRequest } from "next/server"
import { eq, and, count, isNull, isNotNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Transliterate Russian text to Latin for slug generation
function transliterate(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? (c.match(/[a-z0-9]/) ? c : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"))
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20")))
    const offset = (page - 1) * limit

    const showDeleted = req.nextUrl.searchParams.get("deleted") === "true"
    const baseWhere = showDeleted
      ? and(eq(vacancies.companyId, user.companyId), isNotNull(vacancies.deletedAt))
      : and(eq(vacancies.companyId, user.companyId), isNull(vacancies.deletedAt))

    const [totalResult] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(baseWhere)

    const rows = await db
      .select()
      .from(vacancies)
      .where(baseWhere)
      .orderBy(vacancies.createdAt)
      .limit(limit)
      .offset(offset)

    return apiSuccess({
      vacancies: rows,
      total: totalResult?.value ?? 0,
      page,
      limit,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()

    const body = await req.json() as {
      title: string
      description?: string
      city?: string
      format?: string
      employment?: string
      category?: string
      salary_min?: number
      salary_max?: number
    }

    if (!body.title?.trim()) {
      return apiError("'title' is required", 400)
    }

    const slug = `${transliterate(body.title)}-${nanoid(6)}`

    const [vacancy] = await db
      .insert(vacancies)
      .values({
        companyId: user.companyId,
        createdBy: user.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        city: body.city,
        format: body.format,
        employment: body.employment,
        category: body.category,
        salaryMin: body.salary_min,
        salaryMax: body.salary_max,
        status: "draft" as const,
        slug,
      })
      .returning()

    return apiSuccess(vacancy, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /api/modules/hr/vacancies]", err)
    return apiError("Internal server error", 500)
  }
}
