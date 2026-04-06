import { NextRequest } from "next/server"
import { eq, and, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeCategories, knowledgeArticles } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(knowledgeCategories)
      .where(and(
        eq(knowledgeCategories.tenantId, user.companyId),
        eq(knowledgeCategories.status, "active"),
      ))
      .orderBy(knowledgeCategories.sortOrder)

    return apiSuccess({ categories: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

function slugify(text: string): string {
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

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      name: string
      description?: string
      icon?: string
      sortOrder?: number
      parentId?: string
    }

    if (!body.name?.trim()) return apiError("'name' is required", 400)

    const slug = slugify(body.name)

    const [category] = await db
      .insert(knowledgeCategories)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        slug,
        description: body.description?.trim() || null,
        icon: body.icon || null,
        sortOrder: body.sortOrder ?? 0,
        parentId: body.parentId || null,
      })
      .returning()

    return apiSuccess(category, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
