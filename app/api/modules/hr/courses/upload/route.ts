import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { extractText } from "@/lib/utils/extract-text"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Файл слишком большой (максимум 10 МБ)" }, { status: 400 })
    }

    const allowedExtensions = [".pdf", ".docx", ".pptx", ".txt", ".md"]
    const filename = file.name.toLowerCase()
    const isAllowed = allowedExtensions.some(ext => filename.endsWith(ext))

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Формат не поддерживается. Допустимые форматы: PDF, DOCX, PPTX, TXT, MD" },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const text = await extractText(buffer, file.name)

    return NextResponse.json({
      text,
      filename: file.name,
      size: file.size,
      charCount: text.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка при обработке файла"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
