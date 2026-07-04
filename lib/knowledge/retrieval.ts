// Общий поиск материалов базы знаний для контекста AI-ответа.
//
// Раньше каждый потребитель (ai-search, Telegram-бот, публичный чат) сам
// собирал контекст: тупо брал последние N материалов по updatedAt без
// ранжирования по релевантности вопросу. app/api/knowledge/ai-search уже
// умел ранжировать по cosine similarity эмбеддингов — эта логика вынесена
// сюда, чтобы Telegram-бот и публичный чат тоже получали топ-N релевантных
// статей, а не сырой дамп последних.
//
// Фолбэк: если у вопроса нет эмбеддинга (нет OPENAI_API_KEY) или у
// материалов пустые embedding — используем старое поведение (последние по
// updatedAt, лимит MAX_PER_TYPE).

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import {
  asVector,
  cosineSimilarity,
  generateEmbedding,
  isEmbeddingsEnabled,
} from "@/lib/knowledge/embeddings"

export interface RetrievalMaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

export interface RetrievalResult {
  context: string
  materialsList: RetrievalMaterialRef[]
  semanticUsed: boolean
}

const EXCERPT_LEN = 300
// Сколько материалов подставлять в контекст Claude.
const DEFAULT_TOP_K = 8
// Cap кандидатов при семантическом ранжировании (весь тенант, но не больше).
const DEFAULT_CANDIDATES = 500
// Фолбэк без эмбеддингов: топ-N по recency на каждый тип.
const DEFAULT_FALLBACK_PER_TYPE = 10

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

function assemble(
  demos: Array<{ id: string; name: string; sections: unknown }>,
  articles: Array<{ id: string; title: string; content: string | null }>,
): { context: string; materialsList: RetrievalMaterialRef[] } {
  const materialsList: RetrievalMaterialRef[] = []
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

  return { context, materialsList }
}

export interface RetrievalOptions {
  /** Сколько материалов брать в контекст (top-K после ранжирования). */
  topK?: number
  /** Cap кандидатов тенанта, которых загружаем для ранжирования. */
  candidateLimit?: number
  /** Лимит per-type для фолбэка без эмбеддингов (старое поведение). */
  fallbackPerType?: number
}

/**
 * Возвращает контекст (топ-K релевантных материалов) для вопроса companyId.
 * Если embeddings недоступны (нет OPENAI_API_KEY, ошибка API, либо у
 * материалов пустые embedding) — тихо переключается на recency-фолбэк.
 */
export async function retrieveKnowledgeContext(
  companyId: string,
  questionText: string,
  opts: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const topK = opts.topK ?? DEFAULT_TOP_K
  const candidateLimit = opts.candidateLimit ?? DEFAULT_CANDIDATES
  const fallbackPerType = opts.fallbackPerType ?? DEFAULT_FALLBACK_PER_TYPE

  if (questionText.trim() && isEmbeddingsEnabled()) {
    try {
      const questionVec = await generateEmbedding(questionText)
      if (questionVec) {
        const [rawDemos, rawArticles] = await Promise.all([
          db
            .select({
              id: demoTemplates.id,
              name: demoTemplates.name,
              sections: demoTemplates.sections,
              embedding: demoTemplates.embedding,
            })
            .from(demoTemplates)
            .where(eq(demoTemplates.tenantId, companyId))
            .orderBy(desc(demoTemplates.updatedAt))
            .limit(candidateLimit),
          db
            .select({
              id: knowledgeArticles.id,
              title: knowledgeArticles.title,
              content: knowledgeArticles.content,
              embedding: knowledgeArticles.embedding,
            })
            .from(knowledgeArticles)
            .where(and(
              eq(knowledgeArticles.tenantId, companyId),
              eq(knowledgeArticles.status, "published"),
            ))
            .orderBy(desc(knowledgeArticles.updatedAt))
            .limit(candidateLimit),
        ])

        type Scored =
          | { score: number; kind: "demo"; row: typeof rawDemos[number] }
          | { score: number; kind: "article"; row: typeof rawArticles[number] }

        const scored: Scored[] = []
        for (const d of rawDemos) {
          const vec = asVector(d.embedding)
          if (!vec) continue
          scored.push({ score: cosineSimilarity(questionVec, vec), kind: "demo", row: d })
        }
        for (const a of rawArticles) {
          const vec = asVector(a.embedding)
          if (!vec) continue
          scored.push({ score: cosineSimilarity(questionVec, vec), kind: "article", row: a })
        }

        if (scored.length > 0) {
          scored.sort((x, y) => y.score - x.score)
          const top = scored.slice(0, topK)
          const demos = top
            .filter((s): s is Extract<Scored, { kind: "demo" }> => s.kind === "demo")
            .map((s) => ({ id: s.row.id, name: s.row.name, sections: s.row.sections }))
          const articles = top
            .filter((s): s is Extract<Scored, { kind: "article" }> => s.kind === "article")
            .map((s) => ({ id: s.row.id, title: s.row.title, content: s.row.content }))

          return { ...assemble(demos, articles), semanticUsed: true }
        }
      }
    } catch (err) {
      console.error("[knowledge/retrieval] semantic search failed, falling back", err)
    }
  }

  // ── Фолбэк: recency, без ранжирования ──────────────────────────────────
  let demos: Array<{ id: string; name: string; sections: unknown }> = []
  let articles: Array<{ id: string; title: string; content: string | null }> = []

  try {
    demos = await db
      .select({ id: demoTemplates.id, name: demoTemplates.name, sections: demoTemplates.sections })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, companyId))
      .orderBy(desc(demoTemplates.updatedAt))
      .limit(fallbackPerType)
  } catch (err) {
    console.error("[knowledge/retrieval] demo_templates query failed", err)
  }

  try {
    articles = await db
      .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, content: knowledgeArticles.content })
      .from(knowledgeArticles)
      .where(and(
        eq(knowledgeArticles.tenantId, companyId),
        eq(knowledgeArticles.status, "published"),
      ))
      .orderBy(desc(knowledgeArticles.updatedAt))
      .limit(fallbackPerType)
  } catch (err) {
    console.error("[knowledge/retrieval] knowledge_articles query failed", err)
  }

  return { ...assemble(demos, articles), semanticUsed: false }
}
