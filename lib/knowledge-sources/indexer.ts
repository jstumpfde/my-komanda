// Индексация одного файла источника: парсинг → структурный чанкинг →
// дифф по textHash → эмбеддинг только изменившихся чанков → сохранение.
// Общая точка для cron-синка (app/api/cron/knowledge-drive-sync) и ручного
// «Синхронизировать сейчас» (app/api/modules/knowledge/sources/[id]/sync).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeSourceDocuments, knowledgeChunks } from "@/lib/db/schema"
import { extractText, isSupportedFile } from "./extract"
import { chunkText } from "@/lib/knowledge/chunking"
import { checkAiTokenLimit } from "@/lib/knowledge/token-limits"
import { getEmbeddingProvider } from "@/lib/knowledge/embeddings"
import { logAiCall } from "@/lib/ai/usage-log"

export interface IndexResult {
  status: "indexed" | "skipped" | "error"
  skipReason?: string
  textChars?: number
  tokensSpent?: number
}

export async function indexDocument(params: {
  companyId: string
  document: { id: string; sourceId: string; name: string; externalPath: string }
  buffer: Buffer
  mimeType: string | null
}): Promise<IndexResult> {
  const { companyId, document, buffer, mimeType } = params

  const sizeCheck = isSupportedFile(document.name, mimeType, buffer.length)
  if (!sizeCheck.ok) {
    await db.update(knowledgeSourceDocuments).set({
      status: "skipped", skipReason: sizeCheck.skipReason, updatedAt: new Date(),
    }).where(eq(knowledgeSourceDocuments.id, document.id))
    return { status: "skipped", skipReason: sizeCheck.skipReason }
  }

  const extracted = await extractText(buffer, document.name, mimeType)
  if (!extracted.ok) {
    await db.update(knowledgeSourceDocuments).set({
      status: "skipped", skipReason: extracted.skipReason, updatedAt: new Date(),
    }).where(eq(knowledgeSourceDocuments.id, document.id))
    return { status: "skipped", skipReason: extracted.skipReason }
  }

  const chunks = chunkText(extracted.text)
  if (chunks.length === 0) {
    const reason = "Из файла не удалось извлечь текст"
    await db.update(knowledgeSourceDocuments).set({
      status: "skipped", skipReason: reason, updatedAt: new Date(),
    }).where(eq(knowledgeSourceDocuments.id, document.id))
    return { status: "skipped", skipReason: reason }
  }

  // Диффим по textHash против уже сохранённых чанков документа —
  // переэмбеддинг только изменившихся (концепт: «чанк-хеши против
  // переэмбеддинга»).
  const existingChunks = await db
    .select({ id: knowledgeChunks.id, ord: knowledgeChunks.ord, textHash: knowledgeChunks.textHash })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, document.id))

  const existingByOrd = new Map(existingChunks.map((c) => [c.ord, c]))
  const toEmbed = chunks.filter((c) => {
    const prev = existingByOrd.get(c.ord)
    return !prev || prev.textHash !== c.textHash
  })

  let tokensSpent = 0
  if (toEmbed.length > 0) {
    const limitCheck = await checkAiTokenLimit(companyId)
    if (!limitCheck.allowed) {
      // Hard-stop: не ошибка документа — источник просто ждёт следующего
      // месяца/увеличения лимита. Статус остаётся как был (pending) —
      // следующий тик крона повторит попытку.
      return { status: "error", skipReason: limitCheck.message }
    }

    const provider = getEmbeddingProvider()
    const { vectors, totalTokens } = await provider.embedBatch(toEmbed.map((c) => c.text))
    tokensSpent = totalTokens
    await logAiCall({
      tenantId: companyId,
      action: "knowledge_drive_index",
      model: "text-embedding-3-small",
      inputTokens: totalTokens,
      outputTokens: 0,
    })

    for (let i = 0; i < toEmbed.length; i++) {
      const chunk = toEmbed[i]
      const vector = vectors[i]
      const prev = existingByOrd.get(chunk.ord)
      if (prev) {
        await db.update(knowledgeChunks).set({
          text: chunk.text, textHash: chunk.textHash, embedding: vector, tokenCount: chunk.tokenCount,
        }).where(eq(knowledgeChunks.id, prev.id))
      } else {
        await db.insert(knowledgeChunks).values({
          tenantId: companyId, documentId: document.id, ord: chunk.ord,
          text: chunk.text, textHash: chunk.textHash, embedding: vector, tokenCount: chunk.tokenCount,
        })
      }
    }
  }

  // Хвост чанков, которых больше нет в новой версии файла (документ стал короче).
  const newOrds = new Set(chunks.map((c) => c.ord))
  const staleOrds = existingChunks.filter((c) => !newOrds.has(c.ord))
  for (const stale of staleOrds) {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.id, stale.id))
  }

  const textChars = chunks.reduce((sum, c) => sum + c.text.length, 0)
  await db.update(knowledgeSourceDocuments).set({
    status: "indexed",
    skipReason: null,
    textChars,
    tokensSpent,
    lastIndexedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(knowledgeSourceDocuments.id, document.id))

  return { status: "indexed", textChars, tokensSpent }
}
