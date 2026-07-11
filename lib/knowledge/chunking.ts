// Структурный чанкинг текста для RAG — общий слой для файлов подключённых
// источников (knowledge_chunks). Статьи редактора пока НЕ мигрированы на
// чанки (остаются один эмбеддинг на статью с обрезкой 8000 символов, см.
// lib/knowledge/embeddings.ts) — концепт kb-connected-sources сознательно
// откладывает эту миграцию как регресс-риск для существующего поиска.
//
// Правила: бьём по заголовкам (markdown ##/###) и абзацам (двойной перевод
// строки), цель ~1200 токенов на чанк, БЕЗ overlap — так проще инвалидация по
// хешу (переэмбеддинг только изменившихся чанков, см. lib/knowledge-sources/
// indexer.ts). Для xlsx (уже разбитого на "## Лист: X" в extract.ts) —
// заголовочное деление естественно совпадает с делением по листам.

import { createHash } from "node:crypto"

export interface TextChunk {
  ord: number
  text: string
  textHash: string
  /** Грубая оценка: length/3.5 — эмпирика для смешанного RU/EN текста
   *  (кириллица токенизируется хуже английского; стандартная оценка
   *  length/4 для EN тут занижала бы токены примерно в полтора раза). */
  tokenCount: number
}

const TARGET_TOKENS = 1200
const CHARS_PER_TOKEN = 3.5
const TARGET_CHARS = Math.round(TARGET_TOKENS * CHARS_PER_TOKEN) // ~4200

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/** Разбивает текст на смысловые блоки по заголовкам и двойным переводам строк. */
function splitIntoBlocks(text: string): string[] {
  const byHeadings = text.split(/\n(?=#{1,3}\s)/g)
  const blocks: string[] = []
  for (const section of byHeadings) {
    if (section.length <= TARGET_CHARS * 1.3) {
      if (section.trim()) blocks.push(section.trim())
      continue
    }
    const paragraphs = section.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean)
    blocks.push(...(paragraphs.length > 0 ? paragraphs : [section.trim()]))
  }
  return blocks.filter(Boolean)
}

export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const blocks = splitIntoBlocks(trimmed)
  const chunks: string[] = []
  let buffer = ""

  for (const block of blocks) {
    if (block.length > TARGET_CHARS * 1.5) {
      // Один блок сам по себе больше цели (напр. длинный абзац без разрывов) —
      // режем жёстко по символам, стараясь не рвать посреди слова.
      if (buffer) { chunks.push(buffer); buffer = "" }
      let rest = block
      while (rest.length > TARGET_CHARS) {
        let cut = rest.lastIndexOf(" ", TARGET_CHARS)
        if (cut < TARGET_CHARS * 0.5) cut = TARGET_CHARS
        chunks.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
      }
      if (rest) buffer = rest
      continue
    }

    const candidate = buffer ? `${buffer}\n\n${block}` : block
    if (candidate.length > TARGET_CHARS && buffer) {
      chunks.push(buffer)
      buffer = block
    } else {
      buffer = candidate
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim())

  return chunks.filter(Boolean).map((t, ord) => ({
    ord,
    text: t,
    textHash: hashText(t),
    tokenCount: estimateTokens(t),
  }))
}
