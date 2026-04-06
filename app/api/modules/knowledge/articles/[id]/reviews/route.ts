import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeReviews, knowledgeArticles, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — список отзывов / комментариев к статье
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const rows = await db
      .select({
        id: knowledgeReviews.id,
        action: knowledgeReviews.action,
        comment: knowledgeReviews.comment,
        voiceUrl: knowledgeReviews.voiceUrl,
        videoUrl: knowledgeReviews.videoUrl,
        attachments: knowledgeReviews.attachments,
        createdAt: knowledgeReviews.createdAt,
        authorId: knowledgeReviews.authorId,
        authorName: users.name,
      })
      .from(knowledgeReviews)
      .leftJoin(users, eq(knowledgeReviews.authorId, users.id))
      .where(and(
        eq(knowledgeReviews.articleId, id),
        eq(knowledgeReviews.tenantId, user.companyId),
      ))
      .orderBy(desc(knowledgeReviews.createdAt))

    return apiSuccess({ reviews: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — добавить комментарий / одобрить / запросить правки
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json() as {
      action: "comment" | "approve" | "request_changes"
      comment?: string
      voiceUrl?: string
      videoUrl?: string
      attachments?: string[]
    }

    if (!body.action) return apiError("'action' is required", 400)

    // Create review record
    const [review] = await db
      .insert(knowledgeReviews)
      .values({
        tenantId: user.companyId,
        articleId: id,
        authorId: user.id,
        action: body.action,
        comment: body.comment || null,
        voiceUrl: body.voiceUrl || null,
        videoUrl: body.videoUrl || null,
        attachments: body.attachments || null,
      })
      .returning()

    // Update article status based on action
    if (body.action === "approve") {
      await db
        .update(knowledgeArticles)
        .set({ status: "published", updatedAt: new Date() })
        .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.tenantId, user.companyId)))
    } else if (body.action === "request_changes") {
      await db
        .update(knowledgeArticles)
        .set({ status: "review_changes", updatedAt: new Date() })
        .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.tenantId, user.companyId)))
    }

    return apiSuccess(review, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
