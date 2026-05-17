import { mkdir, writeFile } from "fs/promises"
import path from "path"

// Качаем фото кандидата с hh и сохраняем локально в
// public/uploads/candidates/{id}/photo.jpg. Возвращаем относительный URL,
// который можно положить в candidates.photo_url.
//
// Зачем: hh подписывает CDN-URL (img.hhcdn.ru/photo/N.jpeg?t&h), но 403'ит
// прямые запросы из браузера по Origin/Referer. Сервер my-komanda этих
// проверок не проходит и получает 200 (проверено curl с продового хоста).
// Поэтому загружаем серверной стороной во время импорта.
//
// Идемпотентно: если sourceUrl уже /uploads/* — возвращаем его без работы.
// На ошибке возвращаем null; вызывающий код решает, оставить ли hh-URL
// как fallback (с 403 в браузере, но без потери данных) или удалить.
export async function saveCandidatePhoto(
  candidateId: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!sourceUrl || typeof sourceUrl !== "string") return null
  if (sourceUrl.startsWith("/uploads/")) return sourceUrl

  try {
    const res = await fetch(sourceUrl, {
      // hh не требует Bearer для img.hhcdn.ru, но дружелюбный UA не помешает.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; my-komanda/1.0)" },
    })
    if (!res.ok) {
      console.warn("[saveCandidatePhoto] fetch failed", {
        candidateId, status: res.status, url: sourceUrl,
      })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) {
      console.warn("[saveCandidatePhoto] empty body", { candidateId, url: sourceUrl })
      return null
    }
    const dir = path.join(process.cwd(), "public", "uploads", "candidates", candidateId)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "photo.jpg"), buf)
    return `/uploads/candidates/${candidateId}/photo.jpg`
  } catch (err) {
    console.warn("[saveCandidatePhoto] error", {
      candidateId, url: sourceUrl,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
