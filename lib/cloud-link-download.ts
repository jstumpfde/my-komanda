// Скачивание файла по публичной ссылке на облако (запасной канал загрузки
// видео-визитки, если сама загрузка на демо-странице не работает — Юрий
// 04.07: TG в РФ иногда режется провайдерами, поэтому облако — главный
// запасной канал, Telegram-бот — второстепенный).
//
// Поддержка:
//   - Яндекс.Диск (disk.yandex.ru / disk.yandex.com) — публичный API
//     cloud-api.yandex.net/v1/disk/public/resources/download?public_key=<url>
//   - Google Drive (drive.google.com) — uc?export=download&id=<id>,
//     с обработкой confirm-токена для больших файлов (антивирус-заглушка).
//   - Облако Mail.ru (cloud.mail.ru) — прямое скачивание по ссылке best-effort;
//     если не получилось — понятная ошибка с советом использовать Я.Диск.
//   - Прямые http(s)-ссылки на видео/аудио — HEAD/GET с проверкой Content-Type.
//
// Лимит размера — 200 МБ (как /api/upload). Стримим в файл, не грузим в
// память целиком (Buffer.concat на 200 МБ — плохая идея на shared хостинге).

export const CLOUD_LINK_MAX_SIZE = 200 * 1024 * 1024

export type CloudProvider = "yandex_disk" | "google_drive" | "mail_ru" | "direct"

export interface ResolvedDownload {
  provider: CloudProvider
  /** Итоговый URL, с которого реально скачиваем байты (после резолва API). */
  downloadUrl: string
  /** Доп. заголовки, если нужны (обычно не нужны). */
  headers?: Record<string, string>
}

export interface CloudLinkError {
  error: string
}

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/** Определяет провайдера по домену ссылки. */
export function detectProvider(url: string): CloudProvider | null {
  if (!isHttpUrl(url)) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host === "disk.yandex.ru" || host === "disk.yandex.com" || host.endsWith(".disk.yandex.ru") || host.endsWith(".disk.yandex.com")) {
    return "yandex_disk"
  }
  if (host === "drive.google.com" || host === "docs.google.com") {
    return "google_drive"
  }
  if (host === "cloud.mail.ru" || host.endsWith(".cloud.mail.ru")) {
    return "mail_ru"
  }
  // Произвольные прямые URL запрещены: серверное скачивание по ссылке от
  // кандидата — SSRF-вектор (внутренние адреса, метаданные, локальные порты).
  return null
}

/**
 * Резолвит исходную ссылку в реальный download-URL (без скачивания байт).
 * Для direct-ссылок возвращает как есть — валидация Content-Type происходит
 * отдельно при самом скачивании (см. downloadToFile в route.ts).
 */
export async function resolveDownloadUrl(url: string, provider: CloudProvider): Promise<ResolvedDownload | CloudLinkError> {
  if (provider === "yandex_disk") {
    try {
      const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(url)}`
      const res = await fetch(apiUrl)
      if (!res.ok) {
        if (res.status === 404) {
          return { error: "Ссылка Яндекс.Диска не найдена. Проверьте, что доступ по ссылке включён и разрешено скачивание." }
        }
        return { error: "Не удалось получить файл с Яндекс.Диска. Проверьте ссылку и доступ." }
      }
      const data = await res.json() as { href?: string }
      if (!data.href) return { error: "Яндекс.Диск не вернул ссылку на файл. Проверьте настройки доступа." }
      return { provider, downloadUrl: data.href }
    } catch {
      return { error: "Не удалось связаться с Яндекс.Диском. Попробуйте ещё раз." }
    }
  }

  if (provider === "google_drive") {
    const id = extractGoogleDriveId(url)
    if (!id) return { error: "Не удалось распознать ссылку Google Drive. Убедитесь, что доступ открыт «Всем, у кого есть ссылка»." }
    // Прямая попытка — для маленьких файлов Google отдаёт файл сразу.
    // Для больших — HTML-страницу с confirm-токеном, которую разбираем ниже
    // на этапе самого скачивания (downloadUrl остаётся «базовым», а обработка
    // confirm — в downloadToFile, т.к. нужен реальный fetch с cookies).
    return { provider, downloadUrl: `https://drive.google.com/uc?export=download&id=${id}` }
  }

  if (provider === "mail_ru") {
    // Mail.ru Cloud не имеет открытого публичного API скачивания — best-effort
    // прямая ссылка. Если сервер вернёт HTML (страницу логина/просмотра)
    // вместо файла — downloadToFile это обнаружит по Content-Type и вернёт
    // понятную ошибку.
    return { provider, downloadUrl: url }
  }

  // direct
  return { provider, downloadUrl: url }
}

function extractGoogleDriveId(url: string): string | null {
  // Форматы: /file/d/<id>/view, ?id=<id>, /open?id=<id>
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  try {
    const parsed = new URL(url)
    const idParam = parsed.searchParams.get("id")
    if (idParam) return idParam
  } catch { /* ignore */ }
  return null
}

/** Content-Type Google возвращает при confirm-заглушке (антивирус-предупреждение). */
export function isGoogleConfirmPage(contentType: string | null, bodyPreview: string): boolean {
  if (contentType && contentType.includes("text/html")) return true
  return bodyPreview.includes("Google Drive - Virus scan warning") || bodyPreview.includes("confirm=")
}

/** Достаёт confirm-токен из HTML-страницы предупреждения Google Drive. */
export function extractGoogleConfirmToken(html: string): string | null {
  const m = html.match(/confirm=([0-9A-Za-z_-]+)/)
  return m ? m[1] : null
}
