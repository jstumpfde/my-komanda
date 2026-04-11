import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { knowledgeArticles } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// POST /api/core/ocr
//
// Универсальный OCR-эндпоинт ядра платформы. Любой модуль (knowledge,
// learning, hr, crm) может использовать этот API для распознавания
// изображений/PDF и (опционально) сохранения результата.
//
// Два режима:
//  1) multipart/form-data с полем "file" — распознать изображение/PDF и
//     вернуть извлечённый текст.
//  2) application/json с { text, title, targetModule } — при targetModule
//     === "knowledge" сохранить как черновик статьи, иначе просто вернуть
//     текст без записи в БД.

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
])

type TargetModule = "knowledge" | "learning" | "hr" | "crm"
const VALID_TARGETS: Set<TargetModule> = new Set([
  "knowledge",
  "learning",
  "hr",
  "crm",
])

const CLAUDE_MODEL = "claude-sonnet-4-20250514"
const CLAUDE_VISION_URL = "https://api.anthropic.com/v1/messages"

const OCR_SYSTEM_PROMPT =
  "Извлеки весь текст из изображения. Сохрани структуру: заголовки, списки, таблицы. " +
  "Если это чек или накладная — извлеки: дату, номер, позиции, суммы. " +
  "Используй Markdown для оформления (# заголовки, -/1. списки, | таблицы |). " +
  "Отвечай на русском. Начни сразу с содержимого — без вводных фраз."

function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return input
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? (c.match(/[a-z0-9]/) ? c : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

function extractTitle(text: string, fallback: string): string {
  const h1 = text.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim().slice(0, 200)
  const h2 = text.match(/^##\s+(.+)/m)
  if (h2) return h2[1].trim().slice(0, 200)
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 5)
  return (firstLine ?? fallback).slice(0, 200)
}

interface ClaudeContentBlock {
  type: string
  text?: string
}

async function callClaudeVision(
  apiKey: string,
  mediaType: string,
  base64: string,
): Promise<string> {
  const isPdf = mediaType === "application/pdf"
  const contentBlock = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      }

  const res = await fetch(CLAUDE_VISION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(isPdf ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: "Извлеки текст из этого документа в Markdown.",
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.error("[core/ocr] Claude Vision", res.status, errText)
    throw new Error(`Claude Vision API вернул ${res.status}`)
  }

  const data = (await res.json()) as { content?: ClaudeContentBlock[] }
  const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
  if (!text) throw new Error("Пустой ответ от Claude Vision")
  return text
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const contentType = req.headers.get("content-type") || ""

    // ── Mode A: JSON — save / return extracted text ──────────────────────
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        text?: string
        title?: string
        targetModule?: TargetModule
        // legacy (knowledge): saveToKnowledge
        saveToKnowledge?: boolean
      }
      if (!body.text?.trim()) return apiError("'text' is required", 400)

      const target: TargetModule | undefined = body.targetModule
        ? VALID_TARGETS.has(body.targetModule)
          ? body.targetModule
          : undefined
        : body.saveToKnowledge
          ? "knowledge"
          : undefined

      const title =
        body.title?.trim() || extractTitle(body.text, "Распознанный документ")

      if (target === "knowledge") {
        const excerpt = body.text.replace(/[#*`>_-]/g, "").trim().slice(0, 300)
        const [article] = await db
          .insert(knowledgeArticles)
          .values({
            tenantId: user.companyId,
            title,
            slug: slugify(title),
            content: body.text,
            excerpt,
            authorId: user.id,
            status: "draft",
            audience: ["employees"],
            tags: ["ocr"],
            reviewCycle: "none",
          })
          .returning({
            id: knowledgeArticles.id,
            title: knowledgeArticles.title,
          })

        return apiSuccess({
          ok: true,
          articleId: article.id,
          title: article.title,
        })
      }

      // Для learning / hr / crm и без targetModule — возвращаем текст без записи.
      return apiSuccess({ ok: true, text: body.text, title })
    }

    // ── Mode B: multipart — OCR ───────────────────────────────────────────
    if (!contentType.includes("multipart/form-data")) {
      return apiError(
        "Используйте multipart/form-data или application/json",
        415,
      )
    }

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return apiError("Файл не найден в поле 'file'", 400)
    }

    const mediaType = (file as File).type || "application/octet-stream"
    if (!ALLOWED_TYPES.has(mediaType)) {
      return apiError(
        `Неподдерживаемый формат: ${mediaType}. Разрешены JPEG, PNG, WebP, PDF`,
        415,
      )
    }

    if (file.size > MAX_SIZE) {
      return apiError(`Файл слишком большой. Максимум 10MB`, 413)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return apiError("ANTHROPIC_API_KEY не настроен", 503)

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString("base64")

    try {
      const text = await callClaudeVision(apiKey, mediaType, base64)
      const title = extractTitle(
        text,
        (file as File).name || "Распознанный документ",
      )
      return apiSuccess({ ok: true, text, title })
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR failed"
      return apiError(message, 502)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[core/ocr]", err)
    return apiError("Internal server error", 500)
  }
}
