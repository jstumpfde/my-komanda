import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import mammoth from "mammoth"

interface ParsedLesson {
  emoji: string
  title: string
  blocks: { type: string; content: string }[]
}

function splitByHeadings(text: string): ParsedLesson[] {
  const lines = text.split("\n")
  const lessons: ParsedLesson[] = []
  let currentTitle = ""
  let currentContent: string[] = []

  const flushLesson = () => {
    const content = currentContent.join("\n").trim()
    if (content || currentTitle) {
      lessons.push({
        emoji: "📄",
        title: currentTitle || `Раздел ${lessons.length + 1}`,
        blocks: content ? [{ type: "text", content: `<p>${content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>` }] : [],
      })
    }
    currentContent = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    // Markdown headings
    const mdMatch = trimmed.match(/^#{1,3}\s+(.+)$/)
    // UPPERCASE lines (at least 3 chars, no lowercase)
    const isUpperHeading = trimmed.length >= 3 && trimmed === trimmed.toUpperCase() && /[A-ZА-ЯЁ]/.test(trimmed)

    if (mdMatch || isUpperHeading) {
      flushLesson()
      currentTitle = mdMatch ? mdMatch[1] : trimmed
    } else {
      currentContent.push(line)
    }
  }
  flushLesson()

  if (lessons.length === 0) {
    lessons.push({
      emoji: "📄",
      title: "Основной раздел",
      blocks: [{ type: "text", content: `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>` }],
    })
  }

  return lessons
}

function splitHtmlByHeadings(html: string): ParsedLesson[] {
  // Split by h1, h2, h3 tags
  const parts = html.split(/(<h[1-3][^>]*>.*?<\/h[1-3]>)/gi)
  const lessons: ParsedLesson[] = []
  let currentTitle = ""
  let currentContent = ""

  const flushLesson = () => {
    const content = currentContent.trim()
    if (content || currentTitle) {
      lessons.push({
        emoji: "📄",
        title: currentTitle || `Раздел ${lessons.length + 1}`,
        blocks: content ? [{ type: "text", content }] : [],
      })
    }
    currentContent = ""
  }

  for (const part of parts) {
    const headingMatch = part.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i)
    if (headingMatch) {
      flushLesson()
      currentTitle = headingMatch[1].replace(/<[^>]+>/g, "").trim()
    } else {
      currentContent += part
    }
  }
  flushLesson()

  if (lessons.length === 0 && html.trim()) {
    lessons.push({
      emoji: "📄",
      title: "Основной раздел",
      blocks: [{ type: "text", content: html }],
    })
  }

  return lessons
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Файл слишком большой (макс 50МБ)" }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  let lessons: ParsedLesson[] = []

  try {
    if (ext === "txt" || ext === "md") {
      const text = await file.text()
      lessons = splitByHeadings(text)
    } else if (ext === "docx") {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.convertToHtml({ buffer })
      lessons = splitHtmlByHeadings(result.value)
    } else if (ext === "pdf") {
      // Dynamic import for pdf-parse (CommonJS module)
      const pdfParse = (await import("pdf-parse")).default
      const buffer = Buffer.from(await file.arrayBuffer())
      const data = await pdfParse(buffer)
      lessons = splitByHeadings(data.text)
    } else {
      return NextResponse.json({ error: "Формат не поддерживается. Используйте DOCX, PDF, TXT или MD" }, { status: 400 })
    }
  } catch (err) {
    console.error("[parse-document]", err)
    return NextResponse.json({ error: "Ошибка парсинга файла" }, { status: 500 })
  }

  return NextResponse.json({ lessons })
}
