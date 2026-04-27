import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { promises as fs } from "fs"
import path from "path"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_MIME: Record<string, string[]> = {
  video: ["video/webm", "video/mp4", "video/quicktime", "video/ogg"],
  audio: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/x-m4a"],
  photo: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
}

function extFromMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase()
  const map: Record<string, string> = {
    "video/webm": "webm",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/ogg": "ogv",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  }
  return map[base] || "bin"
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    const form = await req.formData()
    const file = form.get("file")
    const blockIdRaw = form.get("blockId")
    const mediaTypeRaw = form.get("mediaType")
    const durationRaw = form.get("duration")

    if (!(file instanceof File)) {
      return apiError("Файл не передан", 400)
    }
    if (typeof blockIdRaw !== "string" || !blockIdRaw.trim()) {
      return apiError("blockId обязателен", 400)
    }
    if (typeof mediaTypeRaw !== "string" || !["video", "audio", "photo"].includes(mediaTypeRaw)) {
      return apiError("mediaType должен быть video/audio/photo", 400)
    }

    const blockId = blockIdRaw.trim()
    const mediaType = mediaTypeRaw as "video" | "audio" | "photo"

    if (file.size === 0) return apiError("Файл пустой", 400)
    if (file.size > MAX_SIZE) return apiError("Файл больше 50MB", 413)

    const mime = (file.type || "").toLowerCase()
    const allowed = ALLOWED_MIME[mediaType]
    const mimeOk = allowed.some((m) => mime === m || mime.startsWith(m + ";"))
    if (!mimeOk) {
      return apiError(`Неподдерживаемый формат: ${mime || "unknown"}`, 415)
    }

    const duration = typeof durationRaw === "string" && durationRaw.trim() !== ""
      ? Math.max(0, Math.min(3600, Math.round(Number(durationRaw)) || 0))
      : undefined

    // Найти кандидата
    const rows = await db
      .select({
        id: candidates.id,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (rows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }
    const candidate = rows[0]

    // Сохранить файл
    const ext = extFromMime(mime)
    const safeBlock = sanitizeId(blockId)
    const fileName = `${safeBlock}-${Date.now()}.${ext}`

    const relativeDir = path.join("uploads", "candidates", candidate.id)
    const absoluteDir = path.join(process.cwd(), "public", relativeDir)
    await fs.mkdir(absoluteDir, { recursive: true })

    const absolutePath = path.join(absoluteDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(absolutePath, buffer)

    const publicUrl = "/" + path.posix.join(relativeDir.split(path.sep).join("/"), fileName)

    const answerObj = {
      url: publicUrl,
      mediaType,
      ...(duration !== undefined ? { duration } : {}),
      size: file.size,
      mime,
    }

    // Записать в anketa_answers (append или replace по blockId)
    // Нормализуем — БД может хранить как массив или как объект {"0":{...},"1":{...}}
    const rawAnswers = candidate.anketaAnswers as unknown
    let existing: any[]
    if (Array.isArray(rawAnswers)) {
      existing = rawAnswers
    } else if (rawAnswers && typeof rawAnswers === 'object') {
      existing = Object.values(rawAnswers as Record<string, any>)
    } else {
      existing = []
    }
    const idx = existing.findIndex((a: any) => a?.blockId === blockId)
    const entry = { blockId, answer: answerObj, answeredAt: new Date().toISOString() }
    if (idx >= 0) {
      existing[idx] = entry
    } else {
      existing.push(entry)
    }

    await db
      .update(candidates)
      .set({ anketaAnswers: existing, updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true, url: publicUrl, size: file.size, mime })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/upload-media", err)
    return apiError("Internal server error", 500)
  }
}
