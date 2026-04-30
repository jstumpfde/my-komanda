import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { legalDocuments } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

// Только администратор платформы может редактировать юридические документы —
// от этого зависит юридическая позиция оператора.
export async function PUT(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    await requirePlatformAdmin()
    const { slug } = await context.params

    const body = await req.json() as { title?: string; content_html?: string }
    const title = body.title?.trim()
    const contentHtml = body.content_html

    if (!contentHtml || typeof contentHtml !== "string") {
      return apiError("content_html is required", 400)
    }
    if (title !== undefined && title.length === 0) {
      return apiError("title cannot be empty", 400)
    }

    const patch: { contentHtml: string; updatedAt: Date; title?: string } = {
      contentHtml,
      updatedAt: new Date(),
    }
    if (title) patch.title = title

    const [updated] = await db
      .update(legalDocuments)
      .set(patch)
      .where(eq(legalDocuments.slug, slug))
      .returning({
        title:       legalDocuments.title,
        contentHtml: legalDocuments.contentHtml,
        updatedAt:   legalDocuments.updatedAt,
      })

    if (!updated) return apiError("Document not found", 404)

    return apiSuccess({
      title:        updated.title,
      content_html: updated.contentHtml,
      updated_at:   updated.updatedAt,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin legal PUT]", err)
    return apiError("Internal server error", 500)
  }
}
