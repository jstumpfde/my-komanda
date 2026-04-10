import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import mammoth from "mammoth"

interface ParsedLesson {
  emoji: string
  title: string
  blocks: { type: string; content: string }[]
}

interface ClaudeLesson {
  name?: string
  title?: string
  emoji?: string
  content?: string
}

const MAX_TEXT_CHARS = 50000

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Convert Claude's lightweight markdown-ish content into HTML for the editor.
function contentToHtml(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let inList = false
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const joined = paragraphBuffer.join("<br/>")
    out.push(`<p>${joined}</p>`)
    paragraphBuffer = []
  }
  const closeList = () => {
    if (inList) {
      out.push("</ul>")
      inList = false
    }
  }

  const inlineFormat = (raw: string): string => {
    let s = escapeHtml(raw)
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    return s
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      closeList()
      continue
    }

    const bulletMatch = trimmed.match(/^[•\-\*]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      if (!inList) {
        out.push("<ul>")
        inList = true
      }
      out.push(`<li>${inlineFormat(bulletMatch[1])}</li>`)
      continue
    }

    closeList()
    paragraphBuffer.push(inlineFormat(trimmed))
  }
  flushParagraph()
  closeList()

  return out.join("") || `<p>${escapeHtml(content)}</p>`
}

function tryParseJsonArray(raw: string): ClaudeLesson[] | null {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // fall through
  }

  // Fallback: extract first JSON array via regex
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed
    } catch {
      return null
    }
  }
  return null
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""

  if (ext === "txt" || ext === "md") {
    return await file.text()
  }

  if (ext === "docx") {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default
    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await pdfParse(buffer)
    return data.text
  }

  throw new Error("Формат не поддерживается. Используйте DOCX, PDF, TXT или MD")
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "API ключ не настроен" }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })

  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Файл слишком большой (макс 100МБ)" }, { status: 400 })
  }

  let text: string
  try {
    text = await extractText(file)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка чтения файла"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const cleanedText = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim()
  if (!cleanedText) {
    return NextResponse.json({ error: "Документ пустой" }, { status: 400 })
  }

  const truncated = cleanedText.slice(0, MAX_TEXT_CHARS)

  const prompt = `Ты — эксперт по созданию обучающих демонстраций должности для кандидатов.

Разбей следующий документ на уроки (разделы) для демонстрации должности.

Правила:
- Каждый логический раздел = отдельный урок
- Название урока: краткое, 3-5 слов, с подходящим эмодзи в начале
- Контент урока: сохрани форматирование — абзацы, списки (• ), жирный текст (**текст**)
- Убери мусор: лишние пробелы, повторы, технические артефакты
- Если есть упоминание видео/фото — отметь это в контенте
- Оптимально 8-15 уроков

Верни ТОЛЬКО JSON массив без markdown backticks:
[
  {
    "name": "👋 Приветствие",
    "emoji": "👋",
    "content": "Текст урока с форматированием..."
  }
]

Документ:
${truncated}`

  let claudeResponse: Response
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  } catch (err) {
    console.error("[parse-document] Claude fetch failed", err)
    return NextResponse.json({ error: "Ошибка обращения к Claude API" }, { status: 502 })
  }

  if (!claudeResponse.ok) {
    const body = await claudeResponse.text().catch(() => "")
    console.error("[parse-document] Claude error", claudeResponse.status, body)
    return NextResponse.json({ error: "Claude API вернул ошибку" }, { status: 502 })
  }

  let claudeData: { content?: { type: string; text?: string }[] }
  try {
    claudeData = await claudeResponse.json()
  } catch {
    return NextResponse.json({ error: "Невалидный ответ от Claude API" }, { status: 502 })
  }

  const textContent = claudeData.content?.find((c) => c.type === "text")?.text ?? ""
  if (!textContent) {
    return NextResponse.json({ error: "Пустой ответ от Claude API" }, { status: 502 })
  }

  const lessons = tryParseJsonArray(textContent)
  if (!lessons || lessons.length === 0) {
    console.error("[parse-document] Could not parse lessons JSON:", textContent.slice(0, 500))
    return NextResponse.json({ error: "Не удалось распарсить ответ Claude" }, { status: 502 })
  }

  const result: ParsedLesson[] = lessons
    .map((lesson) => {
      const rawTitle = (lesson.name || lesson.title || "").trim()
      const emoji = (lesson.emoji || "").trim() || "📄"
      // Strip leading emoji from title if it duplicates the emoji field.
      const title = rawTitle.replace(/^\p{Extended_Pictographic}+\s*/u, "").trim() || "Раздел"
      const content = (lesson.content || "").trim()
      return {
        emoji,
        title,
        blocks: content ? [{ type: "text", content: contentToHtml(content) }] : [],
      }
    })
    .filter((l) => l.title || l.blocks.length > 0)

  if (result.length === 0) {
    return NextResponse.json({ error: "Claude не вернул уроки" }, { status: 502 })
  }

  return NextResponse.json({ lessons: result })
}
