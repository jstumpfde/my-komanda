import { NextRequest } from "next/server"
import { eq, and, ilike, sql, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { reindexArticleById } from "@/lib/knowledge/embeddings"

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

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams

    const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20")))
    const offset = (page - 1) * limit

    const categoryId = sp.get("category_id")
    const status = sp.get("status")
    const search = sp.get("search")
    const tag = sp.get("tag")

    const conditions = [eq(knowledgeArticles.tenantId, user.companyId)]
    if (categoryId) conditions.push(eq(knowledgeArticles.categoryId, categoryId))
    if (status) conditions.push(eq(knowledgeArticles.status, status))
    if (search) conditions.push(ilike(knowledgeArticles.title, `%${search}%`))
    if (tag) conditions.push(sql`${tag} = ANY(${knowledgeArticles.tags})`)

    const where = and(...conditions)

    const [totalResult] = await db.select({ value: count() }).from(knowledgeArticles).where(where)

    const rows = await db
      .select()
      .from(knowledgeArticles)
      .where(where)
      .orderBy(sql`${knowledgeArticles.isPinned} DESC, ${knowledgeArticles.createdAt} DESC`)
      .limit(limit)
      .offset(offset)

    return apiSuccess({ articles: rows, total: totalResult?.value ?? 0, page, limit })
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
      categoryId?: string
      content?: string
      excerpt?: string
      isPinned?: boolean
      status?: string
      tags?: string[]
      audience?: string[]
      reviewCycle?: string
      validUntil?: string | null
    }

    if (!body.title?.trim()) return apiError("'title' is required", 400)

    const slug = slugify(body.title)
    const audience = Array.isArray(body.audience) && body.audience.length > 0
      ? body.audience.filter((v): v is string => typeof v === "string")
      : ["employees"]
    const reviewCycle = typeof body.reviewCycle === "string" && body.reviewCycle ? body.reviewCycle : "none"
    const validUntil = body.validUntil && !isNaN(Date.parse(body.validUntil)) ? new Date(body.validUntil) : null

    const [article] = await db
      .insert(knowledgeArticles)
      .values({
        tenantId: user.companyId,
        categoryId: body.categoryId || null,
        title: body.title.trim(),
        slug,
        content: body.content || null,
        excerpt: body.excerpt || null,
        authorId: user.id,
        isPinned: body.isPinned ?? false,
        status: body.status ?? "draft",
        tags: body.tags || null,
        audience,
        reviewCycle,
        validUntil,
      })
      .returning()

    // RAG: fire-and-forget переиндексация
    void reindexArticleById(article.id)

    return apiSuccess(article, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
