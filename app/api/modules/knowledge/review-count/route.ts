import { and, eq, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// GET /api/modules/knowledge/review-count
// Лёгкий счётчик для бейджа sidebar «На проверке»: сколько статей в статусе
// review или expired у текущего тенанта.

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.tenantId, user.companyId),
          or(
            eq(knowledgeArticles.status, "review"),
            eq(knowledgeArticles.status, "expired"),
          ),
        ),
      )
    return apiSuccess({ count: row?.value ?? 0 })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
