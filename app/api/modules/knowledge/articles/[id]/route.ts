import { NextRequest } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { reindexArticleById } from "@/lib/knowledge/embeddings"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [article] = await db
      .select()
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.tenantId, user.companyId)))

    if (!article) return apiError("Not found", 404)

    // Increment views
    await db
      .update(knowledgeArticles)
      .set({ viewsCount: sql`${knowledgeArticles.viewsCount} + 1` })
      .where(eq(knowledgeArticles.id, id))

    return apiSuccess({ ...article, viewsCount: (article.viewsCount ?? 0) + 1 })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as Partial<{
      title: string
      categoryId: string
      content: string
      excerpt: string
      isPinned: boolean
      status: string
      tags: string[]
      audience: string[]
      reviewCycle: string
      validUntil: string | null
    }>

    const { validUntil: rawValidUntil, ...rest } = body
    const validUntil = rawValidUntil === undefined
      ? undefined
      : rawValidUntil && !isNaN(Date.parse(rawValidUntil))
        ? new Date(rawValidUntil)
        : null

    const [updated] = await db
      .update(knowledgeArticles)
      .set({
        ...rest,
        ...(validUntil !== undefined && { validUntil }),
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)

    // RAG: переиндексация только если менялось содержимое
    if (body.title !== undefined || body.content !== undefined) {
      void reindexArticleById(updated.id)
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .update(knowledgeArticles)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
