import { NextRequest } from "next/server"
import { eq, and, or, ilike, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const q = req.nextUrl.searchParams.get("q")?.trim()

    if (!q) return apiSuccess({ articles: [] })

    const rows = await db
      .select()
      .from(knowledgeArticles)
      .where(and(
        eq(knowledgeArticles.tenantId, user.companyId),
        eq(knowledgeArticles.status, "published"),
        or(
          ilike(knowledgeArticles.title, `%${q}%`),
          ilike(knowledgeArticles.content, `%${q}%`),
        ),
      ))
      .orderBy(sql`${knowledgeArticles.isPinned} DESC, ${knowledgeArticles.viewsCount} DESC`)
      .limit(20)

    return apiSuccess({ articles: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
