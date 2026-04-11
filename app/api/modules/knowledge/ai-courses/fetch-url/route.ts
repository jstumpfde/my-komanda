import { NextRequest } from "next/server"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// POST /api/modules/knowledge/ai-courses/fetch-url
//
// Универсальный fetch любой ссылки для AI-курсов.
// Определяет платформу по URL и извлекает текст:
//   - YouTube       → транскрипт через youtube-transcript
//   - Rutube        → HTML parse (description / title)
//   - VK Video      → HTML parse
//   - Google Drive  → download файла → pdf/docx/txt → extractText
//   - Яндекс.Диск   → public API → download → extractText
//   - direct        → fetch HTML, strip tags, взять <main>/<article>/<body>
//
// Опционально: { username, password } для Basic Auth.
// Возвращает: { platform, title, text, url, wordCount }

const MAX_BYTES = 15 * 1024 * 1024 // 15MB for downloaded files
const MAX_TEXT = 50_000 // символов сохраняем для курса

type Platform =
  | "youtube"
  | "rutube"
  | "vk"
  | "google_drive"
  | "yandex_disk"
  | "direct"

interface FetchRequestBody {
  url?: string
  username?: string
  password?: string
}

function detectPlatform(url: string): Platform {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
    if (host.includes("rutube.ru")) return "rutube"
    if (host.includes("vk.com") || host.includes("vkvideo.ru")) return "vk"
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "google_drive"
    if (host.includes("disk.yandex") || host.includes("yadi.sk")) return "yandex_disk"
    return "direct"
  } catch {
    return "direct"
  }
}

function basicAuthHeader(username?: string, password?: string): Record<string, string> {
  if (!username || !password) return {}
  const encoded = Buffer.from(`${username}:${password}`).toString("base64")
  return { Authorization: `Basic ${encoded}` }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function stripHtml(html: string): string {
  // Drop scripts/styles then strip tags
  const noScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
  return noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function extractTitle(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1) return stripHtml(h1[1])
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
  if (og) return og[1].trim()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (title) return title[1].trim()
  return null
}

function extractMain(html: string): string {
  // Prefer <article> or <main>, иначе body
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (article) return stripHtml(article[1]).slice(0, MAX_TEXT)
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  if (main) return stripHtml(main[1]).slice(0, MAX_TEXT)
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (body) return stripHtml(body[1]).slice(0, MAX_TEXT)
  return stripHtml(html).slice(0, MAX_TEXT)
}

// ─── Platform-specific fetchers ────────────────────────────────────────────

async function fetchYouTube(url: string): Promise<{ title: string; text: string }> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const transcript = await YoutubeTranscript.fetchTranscript(url)
    const text = transcript.map((t: { text: string }) => t.text).join(" ").slice(0, MAX_TEXT)
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/)
    const videoId = match?.[1] ?? "video"
    return { title: `YouTube: ${videoId}`, text }
  } catch (err) {
    throw new Error(`Не удалось получить субтитры YouTube: ${(err as Error).message ?? ""}`)
  }
}

async function fetchHtml(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0)",
      Accept: "text/html,application/xhtml+xml",
      ...headers,
    },
    redirect: "follow",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

async function fetchBinary(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ buffer: Buffer; contentType: string; filename: string | null }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0)",
      ...headers,
    },
    redirect: "follow",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const contentLength = Number(res.headers.get("content-length") ?? "0")
  if (contentLength > MAX_BYTES) throw new Error("Файл слишком большой")

  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream"
  const disp = res.headers.get("content-disposition") ?? ""
  const fnMatch = disp.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
  const filename = fnMatch ? decodeURIComponent(fnMatch[1]) : null

  const arrayBuffer = await res.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_BYTES) throw new Error("Файл слишком большой")
  return { buffer: Buffer.from(arrayBuffer), contentType, filename }
}

// URL path extension (без query/fragment), e.g. "/foo/bar.pdf?x=1" → ".pdf"
function extensionFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    const match = path.match(/\.([a-z0-9]+)$/)
    return match ? `.${match[1]}` : ""
  } catch {
    return ""
  }
}

async function extractFromBinary(
  buffer: Buffer,
  contentType: string,
  filename: string | null,
): Promise<string> {
  const name = (filename ?? "").toLowerCase()
  const type = contentType.toLowerCase()

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    return (result.text ?? "").slice(0, MAX_TEXT)
  }
  if (
    type.includes("wordprocessingml") ||
    type.includes("msword") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value.slice(0, MAX_TEXT)
  }
  if (type.includes("csv") || name.endsWith(".csv")) {
    // CSV читаем как plain text — модель сама разберётся со столбцами
    return buffer.toString("utf-8").slice(0, MAX_TEXT)
  }
  if (
    type.includes("markdown") ||
    type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    return buffer.toString("utf-8").slice(0, MAX_TEXT)
  }
  if (type.includes("html")) {
    const html = buffer.toString("utf-8")
    return extractMain(html)
  }
  throw new Error(`Неподдерживаемый тип файла: ${contentType || filename || "unknown"}`)
}

// Google Drive: https://drive.google.com/file/d/FILE_ID/view → download URL
function normalizeGoogleDrive(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return `https://drive.google.com/uc?export=download&id=${m1[1]}`
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return `https://drive.google.com/uc?export=download&id=${m2[1]}`
  return null
}

// Yandex.Disk public API
async function fetchYandexDisk(url: string): Promise<{ title: string; text: string }> {
  const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(url)}`
  const apiRes = await fetch(apiUrl, { headers: { Accept: "application/json" } })
  if (!apiRes.ok) throw new Error(`Yandex API HTTP ${apiRes.status}`)
  const json = (await apiRes.json()) as { href?: string }
  if (!json.href) throw new Error("Yandex: нет download href")
  const { buffer, contentType, filename } = await fetchBinary(json.href)
  const text = await extractFromBinary(buffer, contentType, filename)
  return { title: filename ?? "Яндекс.Диск", text }
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
    const body = (await req.json().catch(() => ({}))) as FetchRequestBody

    const rawUrl = body.url?.trim()
    if (!rawUrl) return apiError("'url' обязателен", 400)

    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return apiError("Невалидный URL", 400)
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return apiError("Разрешены только http/https URL", 400)
    }

    const platform = detectPlatform(rawUrl)
    const authHeaders = basicAuthHeader(body.username, body.password)

    let title = parsed.hostname
    let text = ""

    try {
      if (platform === "youtube") {
        const r = await fetchYouTube(rawUrl)
        title = r.title
        text = r.text
      } else if (platform === "rutube" || platform === "vk") {
        const html = await fetchHtml(rawUrl, authHeaders)
        title = extractTitle(html) ?? parsed.hostname
        text = extractMain(html)
      } else if (platform === "google_drive") {
        const dlUrl = normalizeGoogleDrive(rawUrl)
        if (!dlUrl) return apiError("Не удалось определить Google Drive файл", 400)
        const { buffer, contentType, filename } = await fetchBinary(dlUrl, authHeaders)
        text = await extractFromBinary(buffer, contentType, filename)
        title = filename ?? "Google Drive"
      } else if (platform === "yandex_disk") {
        const r = await fetchYandexDisk(rawUrl)
        title = r.title
        text = r.text
      } else {
        // direct — сначала определяем по расширению URL, потом по content-type
        const urlExt = extensionFromUrl(rawUrl)
        const FILE_EXTS = new Set([".pdf", ".docx", ".doc", ".txt", ".md", ".csv"])
        const forceBinary = FILE_EXTS.has(urlExt)

        const res = await fetch(rawUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0)",
            ...authHeaders,
          },
          redirect: "follow",
        })
        if (!res.ok) {
          return apiError(`Не удалось загрузить (HTTP ${res.status})`, 502)
        }
        const contentType = res.headers.get("content-type") ?? ""
        const contentLength = Number(res.headers.get("content-length") ?? "0")
        if (contentLength > MAX_BYTES) return apiError("Файл слишком большой (>15MB)", 413)

        // Если URL заканчивается на .pdf/.docx/.txt/.md/.csv — идём прямо в binary,
        // игнорируя content-type (сервер может отдавать octet-stream).
        if (!forceBinary && (contentType.includes("html") || contentType.includes("text/plain"))) {
          const html = await res.text()
          title = extractTitle(html) ?? parsed.hostname
          text = contentType.includes("html") ? extractMain(html) : html.slice(0, MAX_TEXT)
        } else {
          const arrayBuffer = await res.arrayBuffer()
          if (arrayBuffer.byteLength > MAX_BYTES) {
            return apiError("Файл слишком большой (>15MB)", 413)
          }
          const buffer = Buffer.from(arrayBuffer)
          const disp = res.headers.get("content-disposition") ?? ""
          const fnMatch = disp.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
          const filename = fnMatch
            ? decodeURIComponent(fnMatch[1])
            : parsed.pathname.split("/").pop() || null
          text = await extractFromBinary(buffer, contentType, filename)
          title = filename ?? parsed.hostname
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки"
      return apiError(msg, 502)
    }

    if (!text.trim()) {
      return apiError("Не удалось извлечь текст из источника", 422)
    }

    return apiSuccess({
      platform,
      url: rawUrl,
      title: title.slice(0, 200),
      text,
      wordCount: wordCount(text),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-courses/fetch-url]", err)
    return apiError("Internal server error", 500)
  }
}
