import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { promises as fs } from "fs"
import path from "path"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { publicDir } from "@/lib/uploads-path"
import { checkRateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_SIZE = 200 * 1024 * 1024 // 200MB

// Форматы, которые точно принимаем. Записанное в браузере видео = mp4 (iOS) или
// webm (Android/Chrome). НО кандидат может ЗАГРУЗИТЬ готовый файл с телефона —
// и мобильные пикеры отдают 3gp/mkv/avi/m4v и т.п., а иногда пустой file.type.
// Раньше сервер отклонял их как «Неподдерживаемый формат» → «видео не
// отправляется». Список расширен под реальные мобильные форматы; хранится файл
// как есть (плеер браузера тянет большинство, остальное можно переконвертировать).
const ALLOWED_MIME: Record<string, string[]> = {
  video: [
    "video/webm", "video/mp4", "video/quicktime", "video/ogg",
    "video/3gpp", "video/3gpp2", "video/x-matroska", "video/x-msvideo",
    "video/avi", "video/x-m4v", "video/mpeg", "video/x-flv",
  ],
  audio: [
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg",
    "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/aac", "audio/3gpp",
    "audio/amr", "audio/x-caf", "audio/flac",
  ],
  photo: [
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
    "image/heif", "image/bmp", "image/tiff",
  ],
}

// Префикс типа по объявленному mediaType — для случая, когда браузер прислал
// пустой/неизвестный file.type (частое на Android): принимаем по семейству,
// раз кандидат явно записывал/выбирал видео/аудио/фото.
const MEDIA_TYPE_PREFIX: Record<string, string> = {
  video: "video/",
  audio: "audio/",
  photo: "image/",
}

function extFromMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase()
  const map: Record<string, string> = {
    "video/webm": "webm",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/ogg": "ogv",
    "video/3gpp": "3gp",
    "video/3gpp2": "3g2",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
    "video/avi": "avi",
    "video/x-m4v": "m4v",
    "video/mpeg": "mpg",
    "video/x-flv": "flv",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/aac": "aac",
    "audio/3gpp": "3gp",
    "audio/amr": "amr",
    "audio/x-caf": "caf",
    "audio/flac": "flac",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
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

    // Rate-limit: 20 загрузок в час по связке token+IP против исчерпания диска
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    const rlKey = `upload-media:${token}:${ip}`
    if (!checkRateLimit(rlKey, 20, 60 * 60 * 1000)) {
      return apiError("Слишком много загрузок, попробуйте позже", 429)
    }

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
    if (file.size > MAX_SIZE) return apiError("Файл больше 200MB", 413)

    const mime = (file.type || "").toLowerCase()
    // SVG отсекаем всегда: инлайн-SVG с публичного /uploads исполняет скрипты
    // (stored XSS), а по prefix "image/" он иначе прошёл бы как photo.
    if (mime === "image/svg+xml" || mime.startsWith("image/svg") ||
        (file.name.split(".").pop()?.toLowerCase() ?? "") === "svg") {
      return apiError("Формат SVG не поддерживается", 415)
    }
    const allowed = ALLOWED_MIME[mediaType]
    const prefix = MEDIA_TYPE_PREFIX[mediaType]
    // Принимаем если: (1) точное совпадение/с codecs-суффиксом из белого списка,
    // (2) любой тип нужного семейства (video/* для видео и т.п.) — файлы с
    // экзотическим, но корректным типом не отклоняем, (3) пустой type (Android
    // иногда не проставляет) — доверяем объявленному mediaType.
    const mimeOk =
      mime === "" ||
      mime.startsWith(prefix) ||
      allowed.some((m) => mime === m || mime.startsWith(m + ";"))
    if (!mimeOk) {
      return apiError(`Неподдерживаемый формат: ${mime || "unknown"}`, 415)
    }
    // Эффективный mime для сохранения/расширения: пустой заменяем разумным
    // дефолтом семейства, чтобы файл получил корректное расширение и проигрался.
    const effectiveMime = mime || { video: "video/mp4", audio: "audio/mp4", photo: "image/jpeg" }[mediaType]

    const duration = typeof durationRaw === "string" && durationRaw.trim() !== ""
      ? Math.max(0, Math.min(3600, Math.round(Number(durationRaw)) || 0))
      : undefined

    // Найти кандидата (short_id или token)
    const rows = await db
      .select({
        id: candidates.id,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (rows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }
    const candidate = rows[0]

    // Сохранить файл
    const ext = extFromMime(effectiveMime)
    const safeBlock = sanitizeId(blockId)
    const fileName = `${safeBlock}-${Date.now()}.${ext}`

    const relativeDir = path.join("uploads", "candidates", candidate.id)
    const absoluteDir = publicDir(relativeDir)
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
      mime: effectiveMime,
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

    return apiSuccess({ ok: true, url: publicUrl, size: file.size, mime: effectiveMime })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/upload-media", err)
    return apiError("Internal server error", 500)
  }
}
