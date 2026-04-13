import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = (await req.json()) as { url?: string }
    const url = body.url?.trim()
    if (!url) return apiError("URL обязателен", 400)

    // Basic URL validation
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return apiError("Некорректный URL", 400)
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return apiError("Поддерживаются только HTTP/HTTPS ссылки", 400)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let html: string
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KomandaBot/1.0)",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: controller.signal,
        redirect: "follow",
      })
      clearTimeout(timeout)
      if (!res.ok) return apiError(`Не удалось загрузить страницу (${res.status})`, 422)
      html = await res.text()
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof DOMException && err.name === "AbortError") {
        return apiError("Превышено время ожидания (15 сек)", 408)
      }
      return apiError("Не удалось загрузить страницу", 422)
    }

    const text = extractText(html)
    if (!text || text.length < 30) {
      return apiError("Не удалось извлечь текст со страницы", 422)
    }

    return apiSuccess({ text: text.slice(0, 30000) })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("fetch-url error:", err)
    return apiError("Internal server error", 500)
  }
}

function extractText(html: string): string {
  // Remove script/style/noscript tags with content
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")

  // Replace <br>, <p>, <div>, <li>, headings with newlines
  clean = clean
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|section|article)[\s>]/gi, "\n")
    .replace(/<[^>]+>/g, " ")

  // Decode HTML entities
  clean = clean
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

  // Collapse whitespace
  clean = clean
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return clean
}
