import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return apiError("Файл не загружен", 400)
    }

    const maxSize = 10 * 1024 * 1024 // 10 MB
    if (file.size > maxSize) {
      return apiError("Файл слишком большой (максимум 10 МБ)", 400)
    }

    const name = file.name.toLowerCase()
    let text = ""

    if (name.endsWith(".txt")) {
      text = await file.text()
    } else if (name.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await pdfParse(buffer)
      text = result.text
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth")
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      return apiError("Неподдерживаемый формат. Используйте DOCX, PDF или TXT", 400)
    }

    // Clean up the text
    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()

    if (!text) {
      return apiError("Не удалось извлечь текст из файла", 400)
    }

    return apiSuccess({ text, fileName: file.name })
  } catch (err) {
    console.error("[POST /api/modules/hr/vacancies/parse-file]", err)
    return apiError("Ошибка обработки файла", 500)
  }
}
