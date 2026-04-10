import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

interface MaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

const MAX_PER_TYPE = 20
const EXCERPT_LEN = 300

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function demoExcerpt(sections: unknown): string {
  if (!Array.isArray(sections) || sections.length === 0) return ""
  const first = sections[0] as { blocks?: { content?: string }[] }
  if (!Array.isArray(first?.blocks)) return ""
  const joined = first.blocks
    .map((b) => stripHtml(b.content || ""))
    .filter(Boolean)
    .join(" ")
  return joined.slice(0, EXCERPT_LEN)
}

export async function POST(req: NextRequest) {
  // Auth first — returns 401 on failure, not 500.
  let user
  try {
    user = await requireCompany()
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-search] auth failed", err)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Body is optional — we don't actually need the question server-side,
    // but parsing it validates the shape and keeps logs meaningful.
    try { await req.json() } catch { /* ignore malformed body */ }

    // Select only the columns we actually need. Audience / review_cycle /
    // valid_until are intentionally excluded — the DB may be out of sync
    // with the schema for those columns.
    let demos: Array<{ id: string; name: string; sections: unknown }> = []
    try {
      demos = await db
        .select({
          id: demoTemplates.id,
          name: demoTemplates.name,
          sections: demoTemplates.sections,
        })
        .from(demoTemplates)
        .where(eq(demoTemplates.tenantId, user.companyId))
        .orderBy(desc(demoTemplates.updatedAt))
        .limit(MAX_PER_TYPE)
    } catch (err) {
      console.error("[ai-search] demo_templates query failed", err)
      // Continue with empty list rather than 500 — the context just gets smaller.
    }

    let articles: Array<{ id: string; title: string; content: string | null }> = []
    try {
      articles = await db
        .select({
          id: knowledgeArticles.id,
          title: knowledgeArticles.title,
          content: knowledgeArticles.content,
        })
        .from(knowledgeArticles)
        .where(and(
          eq(knowledgeArticles.tenantId, user.companyId),
          eq(knowledgeArticles.status, "published"),
        ))
        .orderBy(desc(knowledgeArticles.updatedAt))
        .limit(MAX_PER_TYPE)
    } catch (err) {
      console.error("[ai-search] knowledge_articles query failed", err)
      // Continue with empty list.
    }

    const materialsList: MaterialRef[] = []
    const parts: string[] = []
    let idx = 1

    for (const d of demos) {
      const excerpt = demoExcerpt(d.sections) || "(нет содержания)"
      parts.push(`[${idx}] «${d.name}» (презентация должности)\n${excerpt}`)
      materialsList.push({ id: d.id, name: d.name, type: "demo" })
      idx++
    }

    for (const a of articles) {
      const excerpt = stripHtml(a.content || "").slice(0, EXCERPT_LEN) || "(нет содержания)"
      parts.push(`[${idx}] «${a.title}» (статья)\n${excerpt}`)
      materialsList.push({ id: a.id, name: a.title, type: "article" })
      idx++
    }

    const context = parts.length > 0
      ? parts.join("\n\n")
      : "В базе знаний пока нет материалов."

    return NextResponse.json({ context, materialsList })
  } catch (err) {
    console.error("[ai-search] unexpected error", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
