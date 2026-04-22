import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import mammoth from "mammoth"

const MAX_TEXT_CHARS = 50000

function htmlToMarkdown(html: string): string {
  return html
    // Заголовки
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n\n")
    // Жирный/курсив
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, "*$2*")
    // Списки
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    // Параграфы и переносы
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Удаляем остальные теги
    .replace(/<[^>]+>/g, "")
    // Декодируем HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Убираем лишние пустые строки
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""

  if (ext === "txt" || ext === "md") {
    return await file.text()
  }

  if (ext === "docx") {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.convertToHtml({ buffer })
    let text = result.value.replace(/<b>/g, "<strong>").replace(/<\/b>/g, "</strong>").replace(/<b /g, "<strong ").replace(/<\/i>/g, "</em>").replace(/<i>/g, "<em>").replace(/<i /g, "<em ")
    text = htmlToMarkdown(text)
    return text
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

  return NextResponse.json({
    text: truncated,
    filename: file.name,
    needsClientParsing: true,
  })
}
