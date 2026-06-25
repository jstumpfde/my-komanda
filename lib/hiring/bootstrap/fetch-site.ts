// Фаза 1 онбординга клиента: забрать текст с сайта (главная + ключевые страницы)
// для AI-извлечения профиля продукта. Только сервер. Без новых зависимостей —
// HTML→текст простыми регэкспами (достаточно, чтобы скормить Claude).

const MAX_PAGES = 4              // главная + до 3 внутренних
const MAX_BYTES_PER_PAGE = 800_000
const MAX_TOTAL_CHARS = 24_000   // лимит текста для Claude
const FETCH_TIMEOUT_MS = 12_000

// SSRF-гард: не ходим на localhost/приватные адреса.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true
  const ip = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ip) {
    const a = Number(ip[1]), b = Number(ip[2])
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true
  }
  return false
}

/** Нормализует ввод пользователя в безопасный http(s) URL или null. */
export function normalizeUrl(raw: string): string | null {
  let u = (raw ?? "").trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = "https://" + u
  try {
    const url = new URL(u)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (isPrivateHost(url.hostname)) return null
    if (!url.hostname.includes(".")) return null
    return url.toString()
  } catch { return null }
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0; +https://company24.pro)" },
    })
    if (!res.ok) return ""
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("text/html") && !ct.includes("text/plain") && ct !== "") return ""
    const buf = await res.arrayBuffer()
    const slice = buf.byteLength > MAX_BYTES_PER_PAGE ? buf.slice(0, MAX_BYTES_PER_PAGE) : buf
    return new TextDecoder("utf-8", { fatal: false }).decode(slice)
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Внутренние ссылки на «о компании / продукты / услуги».
function discoverLinks(html: string, baseUrl: string): string[] {
  const out: string[] = []
  const keywords = ["about", "o-kompanii", "о-компании", "company", "product", "produkt", "услуг", "service", "tovar", "catalog", "katalog", "reshen", "solution"]
  const baseHost = (() => { try { return new URL(baseUrl).hostname } catch { return "" } })()
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < 16) {
    try {
      const href = new URL(m[1], baseUrl)
      if (href.hostname !== baseHost) continue
      if (isPrivateHost(href.hostname)) continue
      const path = href.pathname.toLowerCase()
      if (path === "/" || path === "") continue
      if (keywords.some((k) => path.includes(k))) out.push(href.toString().split("#")[0])
    } catch { /* skip */ }
  }
  return [...new Set(out)]
}

export interface SiteFetchResult {
  ok: boolean
  text: string
  pages: string[]
  error?: string
}

/** Забирает текст главной + до 3 релевантных внутренних страниц. */
export async function fetchSiteText(startUrl: string): Promise<SiteFetchResult> {
  const home = await fetchText(startUrl)
  if (!home) return { ok: false, text: "", pages: [], error: "Сайт недоступен или вернул не-HTML" }

  const homeText = htmlToText(home)
  if (homeText.replace(/\s/g, "").length < 60) {
    return { ok: false, text: "", pages: [], error: "На сайте почти нет текста (возможно, SPA/JS) — заполните профиль вручную" }
  }

  const parts = [`[Главная: ${startUrl}]\n${homeText}`]
  const pages = [startUrl]
  for (const link of discoverLinks(home, startUrl).slice(0, MAX_PAGES - 1)) {
    const h = await fetchText(link)
    if (h) {
      const t = htmlToText(h)
      if (t.replace(/\s/g, "").length > 40) { parts.push(`[Страница: ${link}]\n${t}`); pages.push(link) }
    }
  }

  let text = parts.join("\n\n")
  if (text.length > MAX_TOTAL_CHARS) text = text.slice(0, MAX_TOTAL_CHARS)
  return { ok: true, text, pages }
}
