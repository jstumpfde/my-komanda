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

import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  demoTemplates,
  knowledgeArticles,
  knowledgeChunks,
  knowledgeSourceDocuments,
  knowledgeSources,
} from "@/lib/db/schema"
import {
  asVector,
  cosineSimilarity,
  generateEmbedding,
  isEmbeddingsEnabled,
} from "@/lib/knowledge/embeddings"

export interface RetrievalMaterialRef {
  id: string
  name: string
  type: "demo" | "article" | "drive_file"
  /** Только для type === "drive_file" — «Яндекс.Диск → Прайсы» для цитаты в UI. */
  sourceLabel?: string
}

// Провайдер → человекочитаемый ярлык для цитаты («источник: X, Яндекс.Диск → папка»).
const PROVIDER_LABELS: Record<string, string> = {
  yandex_disk: "Яндекс.Диск",
  webdav: "Свой сервер (WebDAV)",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
}

type DriveChunkRow = {
  documentId: string
  text: string
  docName: string
  docPath: string
  provider: string
}

// Папка файла — dirname пути на диске, без имени файла (для цитаты «→ Прайсы»).
function folderOf(path: string): string {
  const idx = path.lastIndexOf("/")
  if (idx <= 0) return ""
  return path.slice(0, idx).replace(/^\//, "")
}

export interface RetrievalResult {
  context: string
  materialsList: RetrievalMaterialRef[]
  semanticUsed: boolean
}

const EXCERPT_LEN = 300
// Чанки файлов подключённых источников уже являются "нарезанной" релевантной
// единицей (см. lib/knowledge/chunking.ts, цель ~1200 токенов) — обрезать их
// до 300 символов, как демо/статьи, означало бы выбросить большую часть
// смысла, который и был отобран cosine-скорингом. Даём больше места.
const DRIVE_EXCERPT_LEN = 1500
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
  driveChunks: DriveChunkRow[] = [],
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
  for (const c of driveChunks) {
    const providerLabel = PROVIDER_LABELS[c.provider] ?? c.provider
    const folder = folderOf(c.docPath)
    const sourceLabel = folder ? `${providerLabel} → ${folder}` : providerLabel
    const excerpt = c.text.slice(0, DRIVE_EXCERPT_LEN) || "(нет содержания)"
    parts.push(`[${idx}] «${c.docName}» (источник: ${sourceLabel})\n${excerpt}`)
    materialsList.push({ id: c.documentId, name: c.docName, type: "drive_file", sourceLabel })
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
        const [rawDemos, rawArticles, rawChunks] = await Promise.all([
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
          // Файлы подключённых источников (Яндекс.Диск и т.д., концепт
          // kb-connected-sources) — только проиндексированные, не удалённые и
          // НЕ из папок с галочкой «не использовать в AI» (aiOptOut, enforced
          // здесь же на уровне retrieval, а не постфактум на готовом ответе —
          // золотой стандарт из концепта §access).
          db
            .select({
              documentId: knowledgeChunks.documentId,
              text: knowledgeChunks.text,
              embedding: knowledgeChunks.embedding,
              docName: knowledgeSourceDocuments.name,
              docPath: knowledgeSourceDocuments.externalPath,
              provider: knowledgeSources.provider,
            })
            .from(knowledgeChunks)
            .innerJoin(knowledgeSourceDocuments, eq(knowledgeChunks.documentId, knowledgeSourceDocuments.id))
            .innerJoin(knowledgeSources, eq(knowledgeSourceDocuments.sourceId, knowledgeSources.id))
            .where(and(
              eq(knowledgeChunks.tenantId, companyId),
              eq(knowledgeSourceDocuments.status, "indexed"),
              eq(knowledgeSourceDocuments.aiOptOut, false),
              isNull(knowledgeSourceDocuments.deletedAt),
            ))
            .orderBy(desc(knowledgeSourceDocuments.lastIndexedAt))
            .limit(candidateLimit),
        ])

        type Scored =
          | { score: number; kind: "demo"; row: typeof rawDemos[number] }
          | { score: number; kind: "article"; row: typeof rawArticles[number] }
          | { score: number; kind: "chunk"; row: typeof rawChunks[number] }

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
        for (const c of rawChunks) {
          const vec = asVector(c.embedding)
          if (!vec) continue
          scored.push({ score: cosineSimilarity(questionVec, vec), kind: "chunk", row: c })
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
          const driveChunks: DriveChunkRow[] = top
            .filter((s): s is Extract<Scored, { kind: "chunk" }> => s.kind === "chunk")
            .map((s) => ({
              documentId: s.row.documentId,
              text: s.row.text,
              docName: s.row.docName,
              docPath: s.row.docPath,
              provider: s.row.provider,
            }))

          return { ...assemble(demos, articles, driveChunks), semanticUsed: true }
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

  // Файлы подключённых источников без эмбеддингов: берём первый чанк (ord=0)
  // самых свежих проиндексированных документов — как приближение "оглавления"
  // файла, раз ранжировать по смыслу нечем.
  let driveChunks: DriveChunkRow[] = []
  try {
    driveChunks = await db
      .select({
        documentId: knowledgeChunks.documentId,
        text: knowledgeChunks.text,
        docName: knowledgeSourceDocuments.name,
        docPath: knowledgeSourceDocuments.externalPath,
        provider: knowledgeSources.provider,
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeSourceDocuments, eq(knowledgeChunks.documentId, knowledgeSourceDocuments.id))
      .innerJoin(knowledgeSources, eq(knowledgeSourceDocuments.sourceId, knowledgeSources.id))
      .where(and(
        eq(knowledgeChunks.tenantId, companyId),
        eq(knowledgeChunks.ord, 0),
        eq(knowledgeSourceDocuments.status, "indexed"),
        eq(knowledgeSourceDocuments.aiOptOut, false),
        isNull(knowledgeSourceDocuments.deletedAt),
      ))
      .orderBy(desc(knowledgeSourceDocuments.lastIndexedAt))
      .limit(fallbackPerType)
  } catch (err) {
    console.error("[knowledge/retrieval] knowledge_chunks fallback query failed", err)
  }

  return { ...assemble(demos, articles, driveChunks), semanticUsed: false }
}
