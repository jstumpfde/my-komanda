// app/api/public/demo/[token]/attach-link/route.ts
// Запасной канал №1 загрузки видео-визитки (04.07, Юрий): если сама загрузка
// на демо-странице не работает, кандидат загружает файл на свой Яндекс.Диск /
// Google Drive / Облако Mail.ru, включает доступ по ссылке — а мы скачиваем
// сами и прикрепляем ответ ТЕМ ЖЕ способом, что POST .../upload-media
// (записываем в candidates.anketaAnswers), чтобы HR видел файл как обычный.
//
// Приоритет над Telegram-ботом (см. app/api/telegram/candidate-bot/webhook) —
// решение Юрия: в РФ Telegram иногда режётся провайдерами и видео идёт плохо.

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
import {
  CLOUD_LINK_MAX_SIZE,
  detectProvider,
  resolveDownloadUrl,
  isGoogleConfirmPage,
  extractGoogleConfirmToken,
  type CloudProvider,
} from "@/lib/cloud-link-download"

export const runtime = "nodejs"
export const maxDuration = 300

const ALLOWED_CONTENT_TYPE_PREFIX = ["video/", "audio/"]

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
}

function extFromContentType(ct: string): string {
  const base = ct.split(";")[0].trim().toLowerCase()
  const map: Record<string, string> = {
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "video/x-matroska": "mkv", "video/x-msvideo": "avi", "video/3gpp": "3gp",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac",
  }
  return map[base] || (base.startsWith("video/") ? "mp4" : base.startsWith("audio/") ? "mp3" : "bin")
}

/**
 * Скачивает файл по ссылке в файл на диске, со стримингом (не грузим 200 МБ
 * в память целиком) и проверкой размера/типа на лету. Обрабатывает
 * Google Drive confirm-страницу («антивирус не может проверить большой файл»).
 */
async function downloadToFile(
  downloadUrl: string,
  provider: CloudProvider,
  destPath: string,
): Promise<{ ok: true; size: number; contentType: string } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetch(downloadUrl, { redirect: "follow" })
  } catch {
    return { ok: false, error: "Не удалось скачать файл по ссылке. Проверьте, что ссылка правильная и доступ открыт." }
  }
  if (!res.ok) {
    return { ok: false, error: `Не удалось скачать файл (сервер источника ответил ${res.status}). Проверьте доступ по ссылке.` }
  }

  let contentType = (res.headers.get("content-type") || "").toLowerCase()

  // Google Drive для крупных файлов сначала отдаёт HTML-страницу
  // предупреждения с confirm-токеном — нужно повторить запрос с ним.
  if (provider === "google_drive" && (contentType.includes("text/html") || contentType.includes("text/plain"))) {
    const html = await res.text()
    if (isGoogleConfirmPage(contentType, html)) {
      const confirmToken = extractGoogleConfirmToken(html)
      if (!confirmToken) {
        return { ok: false, error: "Google Drive запросил подтверждение, но не удалось его получить. Убедитесь, что доступ открыт «Всем, у кого есть ссылка», или используйте Яндекс.Диск." }
      }
      const idMatch = downloadUrl.match(/id=([a-zA-Z0-9_-]+)/)
      const id = idMatch?.[1]
      if (!id) return { ok: false, error: "Не удалось распознать ссылку Google Drive." }
      try {
        res = await fetch(`https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${id}`, { redirect: "follow" })
      } catch {
        return { ok: false, error: "Не удалось скачать файл с Google Drive после подтверждения." }
      }
      if (!res.ok) return { ok: false, error: `Google Drive ответил ошибкой (${res.status}).` }
      contentType = (res.headers.get("content-type") || "").toLowerCase()
    } else {
      return { ok: false, error: "Google Drive не отдал файл напрямую. Проверьте, что доступ открыт «Всем, у кого есть ссылка»." }
    }
  }

  // Mail.ru / нераспознанный контент — если сервер вернул HTML вместо файла,
  // это обычно страница логина/просмотра, а не сам файл.
  if (!contentType || contentType.includes("text/html")) {
    if (provider === "mail_ru") {
      return { ok: false, error: "Не удалось скачать файл с Облака Mail.ru напрямую. Включите доступ по ссылке (разрешите скачивание) или используйте Яндекс.Диск/Google Drive." }
    }
    if (provider === "direct" && !contentType) {
      // Нет заголовка вовсе — попробуем довериться расширению файла в URL, но
      // не HTML-заглушкам без Content-Type.
    } else if (contentType.includes("text/html")) {
      return { ok: false, error: "Ссылка не ведёт напрямую на видео/аудио файл. Проверьте ссылку или используйте Яндекс.Диск/Google Drive." }
    }
  }

  const isAllowedType = ALLOWED_CONTENT_TYPE_PREFIX.some(p => contentType.startsWith(p))
  if (contentType && !isAllowedType && !contentType.includes("octet-stream")) {
    return { ok: false, error: `Файл по ссылке — не видео/аудио (${contentType || "неизвестный тип"}). Проверьте ссылку.` }
  }

  const contentLengthHeader = res.headers.get("content-length")
  if (contentLengthHeader && Number(contentLengthHeader) > CLOUD_LINK_MAX_SIZE) {
    return { ok: false, error: "Файл больше 200 МБ. Сожмите его или запишите короче." }
  }

  if (!res.body) {
    return { ok: false, error: "Сервер источника не отдал содержимое файла." }
  }

  // Стримим в файл, считая размер на лету — обрываем при превышении лимита.
  const fileHandle = await fs.open(destPath, "w")
  let total = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > CLOUD_LINK_MAX_SIZE) {
          await fileHandle.close()
          await fs.unlink(destPath).catch(() => {})
          return { ok: false, error: "Файл больше 200 МБ. Сожмите его или запишите короче." }
        }
        await fileHandle.write(value)
      }
    }
  } finally {
    await fileHandle.close().catch(() => {})
  }

  if (total === 0) {
    await fs.unlink(destPath).catch(() => {})
    return { ok: false, error: "Скачанный файл пустой. Проверьте ссылку." }
  }

  return { ok: true, size: total, contentType: contentType || "video/mp4" }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Тот же rate-limit ключ-паттерн, что upload-media — 20/час на token+IP.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    const rlKey = `attach-link:${token}:${ip}`
    if (!checkRateLimit(rlKey, 20, 60 * 60 * 1000)) {
      return apiError("Слишком много попыток, попробуйте позже", 429)
    }

    const body = await req.json().catch(() => ({})) as { url?: unknown; blockId?: unknown }
    const url = typeof body.url === "string" ? body.url.trim() : ""
    const blockId = typeof body.blockId === "string" ? body.blockId.trim() : ""

    if (!url) return apiError("Ссылка обязательна", 400)
    if (!blockId) return apiError("blockId обязателен", 400)

    const provider = detectProvider(url)
    if (!provider) return apiError("Некорректная ссылка", 400)

    const resolved = await resolveDownloadUrl(url, provider)
    if ("error" in resolved) return apiError(resolved.error, 422)

    // Найти кандидата (short_id или token) — как upload-media.
    const rows = await db
      .select({ id: candidates.id, anketaAnswers: candidates.anketaAnswers })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (rows.length === 0) return apiError("Кандидат не найден", 404)
    const candidate = rows[0]

    const relativeDir = path.join("uploads", "candidates", candidate.id)
    const absoluteDir = publicDir(relativeDir)
    await fs.mkdir(absoluteDir, { recursive: true })

    const safeBlock = sanitizeId(blockId)
    const tmpName = `${safeBlock}-${Date.now()}.tmp`
    const tmpPath = path.join(absoluteDir, tmpName)

    const result = await downloadToFile(resolved.downloadUrl, provider, tmpPath)
    if (!result.ok) {
      return apiError(result.error, 422)
    }

    const ext = extFromContentType(result.contentType)
    const finalName = `${safeBlock}-${Date.now()}.${ext}`
    const finalPath = path.join(absoluteDir, finalName)
    await fs.rename(tmpPath, finalPath)

    const publicUrl = "/" + path.posix.join(relativeDir.split(path.sep).join("/"), finalName)
    const mediaType: "video" | "audio" = result.contentType.startsWith("audio/") ? "audio" : "video"

    const answerObj = {
      url:  publicUrl,
      mediaType,
      size: result.size,
      mime: result.contentType,
    }

    const rawAnswers = candidate.anketaAnswers as unknown
    let existing: any[]
    if (Array.isArray(rawAnswers)) {
      existing = rawAnswers
    } else if (rawAnswers && typeof rawAnswers === "object") {
      existing = Object.values(rawAnswers as Record<string, any>)
    } else {
      existing = []
    }
    const idx = existing.findIndex((a: any) => a?.blockId === blockId)
    const entry = { blockId, answer: answerObj, answeredAt: new Date().toISOString() }
    if (idx >= 0) existing[idx] = entry
    else existing.push(entry)

    await db.update(candidates)
      .set({ anketaAnswers: existing, updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))

    return apiSuccess({ ok: true, url: publicUrl, size: result.size, mime: result.contentType, mediaType })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/attach-link", err)
    return apiError("Internal server error", 500)
  }
}
