import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// POST /api/core/parse-file
//
// Извлечение текста из PDF/DOCX/TXT/MD — универсальный эндпоинт ядра,
// используется Workshop-лаунчером в табе «Из файла». Возвращает
// { title, text, wordCount } без сохранения в БД.

const MAX_SIZE = 15 * 1024 * 1024 // 15MB
const MAX_TEXT = 50_000

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
])

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export async function POST(req: NextRequest) {
  try {
    await requireCompany()

    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return apiError("Используйте multipart/form-data", 415)
    }

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return apiError("Файл не найден в поле 'file'", 400)
    }

    const f = file as File
    const name = (f.name || "").toLowerCase()
    const type = f.type || ""

    const extensionOk =
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".doc") ||
      name.endsWith(".txt") ||
      name.endsWith(".md")

    if (!ALLOWED_TYPES.has(type) && !extensionOk) {
      return apiError(
        `Неподдерживаемый формат: ${type || name}. Разрешены PDF, DOCX, TXT, MD`,
        415,
      )
    }

    if (f.size > MAX_SIZE) {
      return apiError("Файл слишком большой (максимум 15MB)", 413)
    }

    const buffer = Buffer.from(await f.arrayBuffer())
    let text = ""

    try {
      if (type.includes("pdf") || name.endsWith(".pdf")) {
        const { PDFParse } = await import("pdf-parse")
        const parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        text = result.text ?? ""
      } else if (
        type.includes("wordprocessingml") ||
        type.includes("msword") ||
        name.endsWith(".docx") ||
        name.endsWith(".doc")
      ) {
        const mammoth = await import("mammoth")
        const result = await mammoth.extractRawText({ buffer })
        text = result.value
      } else {
        text = buffer.toString("utf-8")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "parse error"
      return apiError(`Не удалось распарсить файл: ${msg}`, 502)
    }

    text = text.trim()
    if (!text) {
      return apiError("Из файла не удалось извлечь текст", 422)
    }
    text = text.slice(0, MAX_TEXT)

    return apiSuccess({
      ok: true,
      title: f.name.replace(/\.[^.]+$/, ""),
      text,
      wordCount: wordCount(text),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[core/parse-file]", err)
    return apiError("Internal server error", 500)
  }
}
