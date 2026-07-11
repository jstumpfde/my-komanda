// Адаптер Яндекс.Диска — REST cloud-api.yandex.net/v1/disk (тот же хост, что
// lib/cloud-link-download.ts использует для публичных ссылок, но здесь —
// приватный доступ по OAuth access_token пользователя).
//
// Готча (см. концепт §arch): у Яндекс.Диска нет resource_id — ключ это path,
// переименование выглядит как delete+create. Митигируем best-effort: не
// делаем спецэвристику в фазе 1 (просто переиндексируем как новый файл;
// старый уйдёт в soft-delete) — принятый компромисс, см. TODO ниже.

import { assertPublicUrl } from "@/lib/ssrf-guard"
import type { SourceAdapter, SourceFileMeta } from "../adapter-types"

const API_BASE = "https://cloud-api.yandex.net/v1/disk"
const PAGE_LIMIT = 200
const MAX_RETRY_ATTEMPTS = 4

interface YaResourceItem {
  name: string
  path: string // "disk:/Регламенты/файл.docx"
  type: "dir" | "file"
  mime_type?: string
  size?: number
  modified?: string
  md5?: string
}

interface YaResourceListResponse {
  _embedded?: { items: YaResourceItem[]; limit: number; offset: number; total: number }
}

// Яндекс.Диск отдаёт путь как "disk:/Папка/файл" — приводим к виду без
// префикса "/Папка/файл" для единообразия с UI и externalPath в БД.
function normalizePath(path: string): string {
  return path.replace(/^disk:/, "") || "/"
}

function toFileMeta(item: YaResourceItem): SourceFileMeta {
  return {
    path: normalizePath(item.path),
    name: item.name,
    isDir: item.type === "dir",
    mimeType: item.mime_type ?? null,
    sizeBytes: item.size ?? null,
    modifiedAt: item.modified ? new Date(item.modified) : null,
    contentHash: item.md5 ?? null,
  }
}

// Обёртка запросов с exponential backoff и уважением Retry-After — Яндекс
// API может вернуть 429/503 под нагрузкой синка нескольких компаний разом.
async function apiRequest(accessToken: string, url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `OAuth ${accessToken}` } })
  if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRY_ATTEMPTS) {
    const retryAfterHeader = res.headers.get("Retry-After")
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0
    const backoffMs = retryAfterMs || Math.min(30_000, 500 * 2 ** attempt)
    await new Promise((r) => setTimeout(r, backoffMs))
    return apiRequest(accessToken, url, attempt + 1)
  }
  return res
}

export class YandexDiskAdapter implements SourceAdapter {
  readonly provider = "yandex_disk"
  readonly supportsNativeDelta = false

  async listChildren(accessToken: string, path: string): Promise<SourceFileMeta[]> {
    const items: YaResourceItem[] = []
    let offset = 0
    for (;;) {
      const fields = "_embedded.items.name,_embedded.items.path,_embedded.items.type," +
        "_embedded.items.mime_type,_embedded.items.size,_embedded.items.modified,_embedded.items.md5,_embedded.total"
      const url = `${API_BASE}/resources?path=${encodeURIComponent(path)}&limit=${PAGE_LIMIT}&offset=${offset}&fields=${encodeURIComponent(fields)}`
      const res = await apiRequest(accessToken, url)
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Яндекс.Диск API ошибка ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = (await res.json()) as YaResourceListResponse
      const embedded = data._embedded
      if (!embedded) break
      items.push(...embedded.items)
      offset += embedded.items.length
      if (embedded.items.length === 0 || offset >= embedded.total) break
    }
    return items.map(toFileMeta)
  }

  async *crawlFolder(accessToken: string, rootPath: string): AsyncGenerator<SourceFileMeta> {
    const stack = [rootPath]
    while (stack.length > 0) {
      const current = stack.pop()!
      const children = await this.listChildren(accessToken, current)
      for (const child of children) {
        if (child.isDir) {
          stack.push(child.path)
          continue
        }
        yield child
      }
    }
  }

  async downloadContent(accessToken: string, path: string): Promise<Buffer> {
    const linkUrl = `${API_BASE}/resources/download?path=${encodeURIComponent(path)}`
    const linkRes = await apiRequest(accessToken, linkUrl)
    if (!linkRes.ok) {
      const text = await linkRes.text().catch(() => "")
      throw new Error(`Не удалось получить ссылку на скачивание: ${linkRes.status} ${text.slice(0, 200)}`)
    }
    const { href } = (await linkRes.json()) as { href?: string }
    if (!href) throw new Error("Яндекс.Диск не вернул ссылку на скачивание")

    // SSRF-защита: href приходит от внешнего API. Редиректы следуем ВРУЧНУЮ
    // (redirect: "manual") с assertPublicUrl на КАЖДЫЙ хоп (MINOR-d из ревью
    // 11.07): fetch с авто-редиректом проверял бы только первый URL, а
    // downloader-хост Яндекса мог бы (теоретически/при компрометации)
    // средиректить во внутреннюю сеть — классический TOCTOU-обход ssrf-guard.
    let currentUrl = href
    const MAX_REDIRECTS = 5
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(currentUrl)
      const fileRes = await fetch(currentUrl, { redirect: "manual" })
      if (fileRes.status >= 300 && fileRes.status < 400) {
        const location = fileRes.headers.get("location")
        if (!location) throw new Error(`Редирект ${fileRes.status} без Location при скачивании файла`)
        currentUrl = new URL(location, currentUrl).toString()
        continue
      }
      if (!fileRes.ok) throw new Error(`Не удалось скачать файл: ${fileRes.status}`)
      const arrayBuffer = await fileRes.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }
    throw new Error(`Слишком много редиректов (>${MAX_REDIRECTS}) при скачивании файла`)
  }
}
