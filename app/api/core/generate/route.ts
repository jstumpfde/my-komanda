import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// POST /api/core/generate
//
// Универсальная AI-генерация текстовых бизнес-документов для любого модуля.
// Принимает { prompt, type, targetModule, language } и возвращает
// { text, title, blocks[] } — где blocks совместимы с типами из
// components/editor/types.ts (Block[]).

const CLAUDE_MODEL = "claude-sonnet-4-20250514"

type TargetModule = "knowledge" | "learning" | "hr" | "crm"
const VALID_TARGETS: Set<TargetModule> = new Set([
  "knowledge",
  "learning",
  "hr",
  "crm",
])

type Language = "ru" | "en"

interface GenerateBody {
  prompt?: string
  type?: string
  targetModule?: TargetModule
  language?: Language
}

const SYSTEM_PROMPT =
  "Ты — помощник по созданию бизнес-документов для российских компаний. " +
  "По запросу пользователя генерируй структурированный документ на русском языке. " +
  "Всегда используй Markdown: начинай с одного заголовка первого уровня (# Название), " +
  "далее — разделы через ## и ###, списки через - или 1., таблицы через | ... |. " +
  "Пиши деловым, но живым языком. Без вводных фраз и без комментариев — только сам документ."

interface ClaudeContentBlock {
  type: string
  text?: string
}

async function callClaude(
  apiKey: string,
  prompt: string,
  type: string | undefined,
  targetModule: TargetModule | undefined,
): Promise<string> {
  const userText =
    `Тип документа: ${type || "универсальный"}\n` +
    `Модуль назначения: ${targetModule || "общий"}\n\n` +
    `Запрос:\n${prompt}`

  const res = await fetch(getClaudeMessagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.error("[core/generate] Claude", res.status, errText)
    throw new Error(`Claude API вернул ${res.status}`)
  }

  const data = (await res.json()) as { content?: ClaudeContentBlock[] }
  const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
  if (!text) throw new Error("Пустой ответ от Claude")
  return text
}

// ─── Markdown → Block[] ───────────────────────────────────────────────────

interface EditorBlock {
  id: string
  type: "heading" | "text" | "divider"
  content:
    | { text: string; level: 1 | 2 | 3 }
    | { html: string }
    | Record<string, never>
  enabled: boolean
  order: number
}

let blockCounter = 0
function nextBlockId(): string {
  blockCounter += 1
  return `blk-${Date.now()}-${blockCounter.toString(36)}`
}

function mdInlineToHtml(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

function markdownToBlocks(md: string): EditorBlock[] {
  const lines = md.split("\n")
  const blocks: EditorBlock[] = []
  let order = 0
  let paragraph: string[] = []
  let list: { kind: "ul" | "ol"; items: string[] } | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    const html = `<p>${paragraph.map(mdInlineToHtml).join("<br>")}</p>`
    blocks.push({
      id: nextBlockId(),
      type: "text",
      content: { html },
      enabled: true,
      order: order++,
    })
    paragraph = []
  }

  const flushList = () => {
    if (!list) return
    const tag = list.kind === "ul" ? "ul" : "ol"
    const items = list.items
      .map((it) => `<li>${mdInlineToHtml(it)}</li>`)
      .join("")
    blocks.push({
      id: nextBlockId(),
      type: "text",
      content: { html: `<${tag}>${items}</${tag}>` },
      enabled: true,
      order: order++,
    })
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
      blocks.push({
        id: nextBlockId(),
        type: "heading",
        content: { text: headingMatch[2].trim(), level },
        enabled: true,
        order: order++,
      })
      continue
    }

    if (/^---+$/.test(line.trim())) {
      flushAll()
      blocks.push({
        id: nextBlockId(),
        type: "divider",
        content: {},
        enabled: true,
        order: order++,
      })
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

function extractTitle(md: string, fallback: string): string {
  const h1 = md.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim().slice(0, 200)
  const first = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 3)
  return (first ?? fallback).slice(0, 200)
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireCompany()

    const body = (await req.json().catch(() => null)) as GenerateBody | null
    if (!body) return apiError("Ожидается JSON body", 400)

    const prompt = body.prompt?.trim()
    if (!prompt) return apiError("'prompt' обязателен", 400)

    const language: Language = body.language === "en" ? "en" : "ru"
    if (language !== "ru") {
      return apiError("Пока поддерживается только language: 'ru'", 400)
    }

    const targetModule =
      body.targetModule && VALID_TARGETS.has(body.targetModule)
        ? body.targetModule
        : undefined

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return apiError("ANTHROPIC_API_KEY не настроен", 503)

    try {
      const text = await callClaude(apiKey, prompt, body.type, targetModule)
      const title = extractTitle(text, "Новый документ")
      const blocks = markdownToBlocks(text)
      return apiSuccess({ ok: true, text, title, blocks })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed"
      return apiError(message, 502)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[core/generate]", err)
    return apiError("Internal server error", 500)
  }
}
