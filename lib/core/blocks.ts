import type { Block, BlockType, BlockContent, HeadingContent, TextContent } from "@/components/editor/types"

// ─── Markdown → Block[] ───────────────────────────────────────────────────
//
// Общие хелперы для преобразования markdown-текста в структуру блоков
// редактора и обратно. Используются Workshop-лаунчером в табах «Из файла»
// и «OCR», а также при сериализации результата для сохранения в модулях.

let idCounter = 0
function nextBlockId(): string {
  idCounter += 1
  return `blk-${Date.now()}-${idCounter.toString(36)}`
}

function mdInlineToHtml(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

export function markdownToBlocks(md: string): Block[] {
  const lines = md.split("\n")
  const blocks: Block[] = []
  let order = 0
  let paragraph: string[] = []
  let list: { kind: "ul" | "ol"; items: string[] } | null = null

  const push = (type: BlockType, content: BlockContent) => {
    blocks.push({ id: nextBlockId(), type, content, enabled: true, order: order++ })
  }

  const flushParagraph = () => {
    if (!paragraph.length) return
    const html = `<p>${paragraph.map(mdInlineToHtml).join("<br>")}</p>`
    push("text", { html } as TextContent)
    paragraph = []
  }

  const flushList = () => {
    if (!list) return
    const tag = list.kind === "ul" ? "ul" : "ol"
    const items = list.items.map((it) => `<li>${mdInlineToHtml(it)}</li>`).join("")
    push("text", { html: `<${tag}>${items}</${tag}>` } as TextContent)
    list = null
  }

  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "")

    if (!line.trim()) {
      flushAll()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushAll()
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3
      push("heading", { text: headingMatch[2].trim(), level } as HeadingContent)
      continue
    }

    if (/^---+$/.test(line.trim())) {
      flushAll()
      push("divider", {} as BlockContent)
      continue
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/)
    if (ulMatch) {
      flushParagraph()
      if (!list || list.kind !== "ul") {
        flushList()
        list = { kind: "ul", items: [] }
      }
      list.items.push(ulMatch[1].trim())
      continue
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/)
    if (olMatch) {
      flushParagraph()
      if (!list || list.kind !== "ol") {
        flushList()
        list = { kind: "ol", items: [] }
      }
      list.items.push(olMatch[1].trim())
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  flushAll()
  return blocks
}

// ─── Block[] → HTML (сохранение в модулях) ────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function blocksToHtml(blocks: Block[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (!b.enabled) continue
    if (b.type === "heading") {
      const c = b.content as HeadingContent
      const lvl = c.level ?? 2
      parts.push(`<h${lvl}>${escapeHtml(c.text ?? "")}</h${lvl}>`)
      continue
    }
    if (b.type === "text") {
      const c = b.content as TextContent
      parts.push(c.html ?? "")
      continue
    }
    if (b.type === "divider") {
      parts.push("<hr />")
      continue
    }
    // Прочие типы (image/video/audio/file/info/button/test/task/video_record)
    // в текстовой сериализации пропускаем — они требуют полноценного
    // рендеринга блочным редактором и не представимы одной строкой HTML.
  }
  return parts.join("\n")
}

// ─── Block[] → plain text (для фолбэка/предпросмотра) ────────────────────

export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.enabled)
    .map((b) => {
      if (b.type === "heading") {
        const c = b.content as HeadingContent
        return c.text ?? ""
      }
      if (b.type === "text") {
        const c = b.content as TextContent
        return (c.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      }
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}
