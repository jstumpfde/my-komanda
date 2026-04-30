import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { legalDocuments } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// Публичный эндпоинт: возвращает текущую редакцию юридического документа.
// Используется на /politicahr2026 и любых других публичных юр-страницах.
export async function GET(_req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params

    const [doc] = await db
      .select({
        title:       legalDocuments.title,
        contentHtml: legalDocuments.contentHtml,
        updatedAt:   legalDocuments.updatedAt,
      })
      .from(legalDocuments)
      .where(eq(legalDocuments.slug, slug))
      .limit(1)

    if (!doc) return apiError("Document not found", 404)

    return apiSuccess({
      title:        doc.title,
      content_html: doc.contentHtml,
      updated_at:   doc.updatedAt,
    })
  } catch (err) {
    console.error("[legal GET]", err)
    return apiError("Internal server error", 500)
  }
}
