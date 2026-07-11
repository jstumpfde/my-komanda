// Knowledge base embeddings helper.
//
// ┌─ Текущее состояние ─────────────────────────────────────────────────────┐
// │ pgvector пока не включён в БД. Поле `embedding` хранится как jsonb      │
// │ (массив float). После `CREATE EXTENSION vector` нужно мигрировать       │
// │ колонки на `vector(1536)` и добавить ivfflat индексы (см. TZ-RAG.md).   │
// │                                                                         │
// │ Все операции косинусной близости выполняются в JS. Для маленьких         │
// │ тенантов (сотни материалов) этого достаточно. После перехода на         │
// │ pgvector — заменить на SQL `embedding <=> $1`.                          │
// └─────────────────────────────────────────────────────────────────────────┘

const OPENAI_MODEL = "text-embedding-3-small"
const EMBEDDING_DIM = 1536
const MAX_TEXT_CHARS = 8000

export function isEmbeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

export function prepareText(title: string | null | undefined, content: string | null | undefined): string {
  const stripped = (content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*`>_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const joined = `${title ?? ""}\n\n${stripped}`.trim()
  return joined.slice(0, MAX_TEXT_CHARS)
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[] }[]
  usage?: { prompt_tokens?: number; total_tokens?: number }
  error?: { message: string }
}

// Single-text embedding via OpenAI. Returns null if OPENAI_API_KEY missing
// or the API fails — caller должен свалиться в text-search fallback.
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: trimmed.slice(0, MAX_TEXT_CHARS),
      }),
    })
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as OpenAIEmbeddingResponse
      console.error("[embeddings] OpenAI", res.status, errBody.error?.message)
      return null
    }
    const data = (await res.json()) as OpenAIEmbeddingResponse
    const vec = data.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) return null
    return vec
  } catch (err) {
    console.error("[embeddings] fetch failed", err)
    return null
  }
}

export interface EmbeddingsBatchResult {
  vectors: (number[] | null)[]
  /** usage.total_tokens из ответа OpenAI — 0, если ключа нет/запрос не удался. */
  totalTokens: number
}

// Batch embeddings — OpenAI принимает input как array. Возвращает массив
// векторов параллельный входу (null для неудачных) + суммарные токены запроса
// (usage.total_tokens), чтобы вызывающий код мог списать их с AI-лимита
// компании (lib/knowledge/token-limits.ts) и залогировать через logAiCall.
// Раньше usage вообще не читался — «Дочинить учёт usage эмбеддингов» из
// концепта kb-connected-sources §arch.
export async function generateEmbeddingsBatchWithUsage(texts: string[]): Promise<EmbeddingsBatchResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { vectors: texts.map(() => null), totalTokens: 0 }
  const prepared = texts.map((t) => t.trim().slice(0, MAX_TEXT_CHARS))
  const nonEmpty = prepared
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.length > 0)

  if (nonEmpty.length === 0) return { vectors: texts.map(() => null), totalTokens: 0 }

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: nonEmpty.map((x) => x.t),
      }),
    })
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as OpenAIEmbeddingResponse
      console.error("[embeddings] OpenAI batch", res.status, errBody.error?.message)
      return { vectors: texts.map(() => null), totalTokens: 0 }
    }
    const data = (await res.json()) as OpenAIEmbeddingResponse
    const result: (number[] | null)[] = texts.map(() => null)
    for (let i = 0; i < nonEmpty.length; i++) {
      const vec = data.data?.[i]?.embedding
      if (Array.isArray(vec) && vec.length === EMBEDDING_DIM) {
        result[nonEmpty[i].i] = vec
      }
    }
    return { vectors: result, totalTokens: data.usage?.total_tokens ?? 0 }
  } catch (err) {
    console.error("[embeddings] batch fetch failed", err)
    return { vectors: texts.map(() => null), totalTokens: 0 }
  }
}

// Обратная совместимость: старые call-сайты (реиндекс статей/демо, ai-search)
// ждут только массив векторов — usage им исторически не был нужен (штучный
// реиндекс одной статьи не списывался с лимита модуля знаний отдельно). Новый
// код (индексация подключённых источников) должен звать
// generateEmbeddingsBatchWithUsage напрямую, чтобы списывать токены с лимита
// компании — см. lib/knowledge-sources/indexer.ts.
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const { vectors } = await generateEmbeddingsBatchWithUsage(texts)
  return vectors
}

// ─── Точка расширения: бэкенд эмбеддингов (концепт §risks — 152-ФЗ) ────────
// Сейчас единственный бэкенд — OpenAI (зарубежный). Реальные клиентские диски
// с ПДн НЕ индексируем, пока не подключён RU-резидентный бэкенд (Yandex
// Cloud) — переключение делается платформенной настройкой EMBEDDING_PROVIDER,
// без изменения вызывающего кода (lib/knowledge-sources/indexer.ts зовёт
// getEmbeddingProvider(), а не generateEmbeddingsBatchWithUsage напрямую).

export interface EmbeddingProvider {
  readonly name: string
  embedBatch(texts: string[]): Promise<EmbeddingsBatchResult>
}

const openaiProvider: EmbeddingProvider = {
  name: "openai",
  embedBatch: generateEmbeddingsBatchWithUsage,
}

/**
 * Текущий провайдер эмбеддингов — из env EMBEDDING_PROVIDER (default
 * "openai"). Другие значения намеренно бросают явную ошибку вместо тихого
 * фолбэка на зарубежный OpenAI — до появления RU-резидентного бэкенда любой
 * другой провайдер означает ошибку конфигурации, а не «просто используй OpenAI».
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const name = process.env.EMBEDDING_PROVIDER || "openai"
  if (name === "openai") return openaiProvider
  throw new Error(`Провайдер эмбеддингов "${name}" не реализован (доступен только "openai" в фазе 1)`)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let aNorm = 0
  let bNorm = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    aNorm += a[i] * a[i]
    bNorm += b[i] * b[i]
  }
  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm)
  return denom === 0 ? 0 : dot / denom
}

// Validate what we read back from jsonb — мог прилететь null или что угодно.
export function asVector(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== EMBEDDING_DIM) return null
  for (const v of raw) {
    if (typeof v !== "number" || Number.isNaN(v)) return null
  }
  return raw as number[]
}

// Fire-and-forget: пересчитать embedding для одной статьи. Вызывается
// из API создания/обновления. Тихо выходит если ключа нет — работает
// fallback текстового поиска.
export async function reindexArticleById(articleId: string): Promise<void> {
  if (!isEmbeddingsEnabled()) return
  try {
    // Ленивый импорт чтобы не тянуть драйвер БД в клиентский бандл.
    const { db } = await import("@/lib/db")
    const { knowledgeArticles } = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")

    const [row] = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        content: knowledgeArticles.content,
      })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, articleId))
      .limit(1)

    if (!row) return
    const text = prepareText(row.title, row.content)
    if (!text) return

    const vec = await generateEmbedding(text)
    if (!vec) return

    await db
      .update(knowledgeArticles)
      .set({ embedding: vec })
      .where(eq(knowledgeArticles.id, articleId))
  } catch (err) {
    console.error("[embeddings] reindexArticleById failed", err)
  }
}
