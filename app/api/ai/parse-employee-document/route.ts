import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

const SYSTEM_PROMPT = `Ты — AI-помощник для распознавания документов сотрудников. Извлеки данные из предоставленного текста документа.

Определи тип документа и извлеки соответствующие данные:

Паспорт: { type: "passport", fullName, birthDate, series, number, issuedBy, issueDate }
СНИЛС: { type: "snils", number }
ИНН: { type: "inn", number }
Диплом: { type: "diploma", institution, specialty, year }
Трудовая книжка: { type: "workbook", entries: [{ company, position, startDate, endDate }] }

ПРАВИЛА:
- Извлекай ТОЛЬКО данные которые явно видны в тексте
- Если данных нет — верни пустую строку
- Верни ТОЛЬКО валидный JSON

ФОРМАТ:
{ "type": "passport", "data": { "fullName": "...", "birthDate": "...", ... } }`

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const contentType = req.headers.get("content-type") || ""

    let text = ""
    let imageBase64 = ""
    let imageMimeType = ""

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file") as File | null
      if (!file) return apiError("Файл не найден", 400)

      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext)

      if (isImage) {
        const bytes = await file.arrayBuffer()
        imageBase64 = Buffer.from(bytes).toString("base64")
        imageMimeType = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`
      } else if (ext === "pdf") {
        // Parse PDF text
        const buffer = Buffer.from(await file.arrayBuffer())
        try {
          const mammoth = await import("mammoth")
          const result = await mammoth.extractRawText({ buffer })
          text = result.value
        } catch {
          // Try pdf-parse
          try {
            const { PDFParse } = await import("pdf-parse")
            const parser = new PDFParse({ data: buffer })
            const result = await parser.getText()
            text = result.text ?? ""
          } catch {
            text = buffer.toString("utf-8").slice(0, 5000)
          }
        }
      } else {
        text = Buffer.from(await file.arrayBuffer()).toString("utf-8").slice(0, 5000)
      }
    } else {
      const body = (await req.json()) as { text?: string }
      text = body.text || ""
    }

    if (!text && !imageBase64) return apiError("Нет данных для анализа", 400)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess({ type: "unknown", data: {}, message: "AI-ключ не настроен" })
    }

    // Build message content
    const content: Anthropic.Messages.ContentBlockParam[] = []

    if (imageBase64) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: imageMimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: imageBase64 },
      })
      content.push({ type: "text", text: "Распознай данные из этого документа сотрудника." })
    } else {
      content.push({ type: "text", text: `Распознай данные из текста документа:\n\n${text.slice(0, 5000)}` })
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return apiError("Не удалось распознать документ", 422)

    return apiSuccess(JSON.parse(jsonMatch[0]))
  } catch (err) {
    if (err instanceof Response) return err
    console.error("parse-employee-document error:", err)
    return apiError("Internal server error", 500)
  }
}
