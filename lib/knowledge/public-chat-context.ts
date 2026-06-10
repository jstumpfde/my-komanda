// Сборка контекста для публичного чата базы знаний (/ask/[code]).
// Используется /api/public/knowledge-chat/context (показ списка материалов)
// и /api/public/knowledge-chat/answer (серверный вызов Claude).

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, knowledgeArticles } from "@/lib/db/schema"

const MAX_PER_TYPE = 20
const EXCERPT_LEN = 300

export interface PublicChatMaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function demoExcerpt(sections: unknown): string {
  if (!Array.isArray(sections) || sections.length === 0) return ""
  const first = sections[0] as { blocks?: { content?: string }[] }
  if (!Array.isArray(first?.blocks)) return ""
  return first.blocks
    .map((b) => stripHtml(b.content || ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, EXCERPT_LEN)
}

export async function buildPublicChatContext(companyId: string): Promise<{
  context: string
  materialsList: PublicChatMaterialRef[]
}> {
  const [demos, articles] = await Promise.all([
    db
      .select({ id: demoTemplates.id, name: demoTemplates.name, sections: demoTemplates.sections })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, companyId))
      .orderBy(desc(demoTemplates.updatedAt))
      .limit(MAX_PER_TYPE),
    db
      .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, content: knowledgeArticles.content })
      .from(knowledgeArticles)
      .where(and(
        eq(knowledgeArticles.tenantId, companyId),
        eq(knowledgeArticles.status, "published"),
      ))
      .orderBy(desc(knowledgeArticles.updatedAt))
      .limit(MAX_PER_TYPE),
  ])

  const parts: string[] = []
  const materialsList: PublicChatMaterialRef[] = []
  let idx = 1

  for (const d of demos) {
    parts.push(`[${idx}] «${d.name}» (презентация)\n${demoExcerpt(d.sections) || "(нет содержания)"}`)
    materialsList.push({ id: d.id, name: d.name, type: "demo" })
    idx++
  }
  for (const a of articles) {
    parts.push(`[${idx}] «${a.title}» (статья)\n${stripHtml(a.content || "").slice(0, EXCERPT_LEN) || "(нет содержания)"}`)
    materialsList.push({ id: a.id, name: a.title, type: "article" })
    idx++
  }

  const context = parts.length > 0
    ? parts.join("\n\n")
    : "В базе знаний пока нет материалов."

  return { context, materialsList }
}
