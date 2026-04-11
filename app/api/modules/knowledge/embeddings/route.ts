import { NextRequest } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import {
  generateEmbeddingsBatch,
  isEmbeddingsEnabled,
  prepareText,
} from "@/lib/knowledge/embeddings"

// GET  — статус индекса для текущего тенанта
// POST — пересчитать embeddings для всех материалов тенанта

const BATCH_SIZE = 50

// ─── Demo content extractor ────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function demoContent(sections: unknown): string {
  if (!Array.isArray(sections)) return ""
  const parts: string[] = []
  for (const section of sections.slice(0, 20)) {
    const s = section as { blocks?: { content?: string }[] }
    if (Array.isArray(s?.blocks)) {
      for (const b of s.blocks) {
        const text = stripHtml(b.content || "")
        if (text) parts.push(text)
      }
    }
  }
  return parts.join(" ").slice(0, 8000)
}

// ─── GET: статус ───────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    const [articleStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        indexed: sql<number>`count(${knowledgeArticles.embedding})::int`,
      })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.tenantId, user.companyId))

    const [demoStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        indexed: sql<number>`count(${demoTemplates.embedding})::int`,
      })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, user.companyId))

    const total = (articleStats?.total ?? 0) + (demoStats?.total ?? 0)
    const indexed = (articleStats?.indexed ?? 0) + (demoStats?.indexed ?? 0)

    return apiSuccess({
      enabled: isEmbeddingsEnabled(),
      total,
      indexed,
      articles: articleStats ?? { total: 0, indexed: 0 },
      demos: demoStats ?? { total: 0, indexed: 0 },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/embeddings] GET", err)
    return apiError("Internal server error", 500)
  }
}

// ─── POST: пересчитать ─────────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  try {
    const user = await requireCompany()

    if (!isEmbeddingsEnabled()) {
      return apiError(
        "OPENAI_API_KEY не настроен. Работает текстовый поиск — семантический поиск недоступен.",
        503,
      )
    }

    // ── Articles ───────────────────────────────────────────────────────
    const articles = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        content: knowledgeArticles.content,
      })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.tenantId, user.companyId))

    let articleSuccess = 0
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const slice = articles.slice(i, i + BATCH_SIZE)
      const texts = slice.map((a) => prepareText(a.title, a.content))
      const vectors = await generateEmbeddingsBatch(texts)
      for (let j = 0; j < slice.length; j++) {
        const vec = vectors[j]
        if (!vec) continue
        await db
          .update(knowledgeArticles)
          .set({ embedding: vec })
          .where(eq(knowledgeArticles.id, slice[j].id))
        articleSuccess++
      }
    }

    // ── Demos ──────────────────────────────────────────────────────────
    const demos = await db
      .select({
        id: demoTemplates.id,
        name: demoTemplates.name,
        sections: demoTemplates.sections,
      })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, user.companyId))

    let demoSuccess = 0
    for (let i = 0; i < demos.length; i += BATCH_SIZE) {
      const slice = demos.slice(i, i + BATCH_SIZE)
      const texts = slice.map((d) => prepareText(d.name, demoContent(d.sections)))
      const vectors = await generateEmbeddingsBatch(texts)
      for (let j = 0; j < slice.length; j++) {
        const vec = vectors[j]
        if (!vec) continue
        await db
          .update(demoTemplates)
          .set({ embedding: vec })
          .where(eq(demoTemplates.id, slice[j].id))
        demoSuccess++
      }
    }

    return apiSuccess({
      ok: true,
      processed: articleSuccess + demoSuccess,
      articles: { total: articles.length, indexed: articleSuccess },
      demos: { total: demos.length, indexed: demoSuccess },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/embeddings] POST", err)
    return apiError("Internal server error", 500)
  }
}

