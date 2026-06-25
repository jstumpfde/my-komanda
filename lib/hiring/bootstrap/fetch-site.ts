// Фаза 1 онбординга клиента: забрать текст с сайта (главная + ключевые страницы)
// для AI-извлечения профиля. Только сервер. Без новых зависимостей.
//
// БЕЗОПАСНОСТЬ (SSRF): фетчим произвольный пользовательский URL, поэтому:
//   - резолвим hostname в IP и проверяем КАЖДЫЙ адрес против приватных диапазонов
//     (IPv4 + IPv6, incl ::ffff: mapped) — закрывает DNS-rebinding и литералы;
//   - редиректы обрабатываем ВРУЧНУЮ (redirect:"manual") и перепроверяем каждый хоп
//     — закрывает увод 30x на 169.254.169.254 / 127.0.0.1.
// Остаточный риск: TOCTOU-rebinding (DNS меняется между lookup и connect) не закрыт
// без IP-pinning; для внутреннего инструмента под авторизованным директором — приемлемо.

import net from "node:net"
import { lookup } from "node:dns/promises"

const MAX_PAGES = 4
const MAX_BYTES_PER_PAGE = 800_000
const MAX_TOTAL_CHARS = 24_000
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECT_HOPS = 4

class SsrfError extends Error {}

function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true            // link-local + метаданные
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true  // CGNAT
    if (a >= 224) return true                          // multicast/reserved
    return false
  }
  if (v === 6) {
    const lo = ip.toLowerCase().replace(/^\[|\]$/g, "")
    if (lo === "::1" || lo === "::") return true
    const mapped = lo.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    if (/^f[cd]/.test(lo)) return true                 // ULA fc00::/7
    if (/^fe[89ab]/.test(lo)) return true              // link-local fe80::/10
    return false
  }
  return true  // не валидный IP — отклоняем
}

/** Резолвит hostname и бросает SsrfError, если ЛЮБОЙ адрес приватный. */
async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (net.isIP(h)) { if (isPrivateIp(h)) throw new SsrfError(); return }
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) throw new SsrfError()
  let addrs: { address: string }[]
  try { addrs = await lookup(h, { all: true }) } catch { throw new SsrfError() }
  if (!addrs.length) throw new SsrfError()
  for (const a of addrs) if (isPrivateIp(a.address)) throw new SsrfError()
}

/** Нормализует ввод в http(s) URL или null (быстрый синхронный фильтр). */
export function normalizeUrl(raw: string): string | null {
  let u = (raw ?? "").trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = "https://" + u
  try {
    const url = new URL(u)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".") && net.isIP(url.hostname) === 0) return null
    return url.toString()
  } catch { return null }
}

// Фетч одного URL с ручными редиректами и перепроверкой каждого хопа.
async function safeFetch(initialUrl: string): Promise<string> {
  let current = initialUrl
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let u: URL
    try { u = new URL(current) } catch { return "" }
    if (u.protocol !== "http:" && u.protocol !== "https:") return ""
    try { await assertPublicHost(u.hostname) } catch { return "" }  // приватный → стоп

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0; +https://company24.pro)" },
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc) return ""
        current = new URL(loc, current).toString()  // следующий хоп перепроверится
        continue
      }
      if (!res.ok) return ""
      const ct = res.headers.get("content-type") ?? ""
      if (ct !== "" && !ct.includes("text/html") && !ct.includes("text/plain")) return ""
      const buf = await res.arrayBuffer()
      const slice = buf.byteLength > MAX_BYTES_PER_PAGE ? buf.slice(0, MAX_BYTES_PER_PAGE) : buf
      return new TextDecoder("utf-8", { fatal: false }).decode(slice)
    } catch {
      return ""
    } finally {
      clearTimeout(timer)
    }
  }
  return ""  // слишком много редиректов
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

/** Забирает текст главной + до 3 релевантных внутренних страниц (SSRF-safe). */
export async function fetchSiteText(startUrl: string): Promise<SiteFetchResult> {
  const home = await safeFetch(startUrl)
  if (!home) return { ok: false, text: "", pages: [], error: "Сайт недоступен, заблокирован или вернул не-HTML" }

  const homeText = htmlToText(home)
  if (homeText.replace(/\s/g, "").length < 60) {
    return { ok: false, text: "", pages: [], error: "На сайте почти нет текста (возможно, SPA/JS) — заполните профиль вручную" }
  }

  const parts = [`[Главная: ${startUrl}]\n${homeText}`]
  const pages = [startUrl]
  for (const link of discoverLinks(home, startUrl).slice(0, MAX_PAGES - 1)) {
    const h = await safeFetch(link)
    if (h) {
      const t = htmlToText(h)
      if (t.replace(/\s/g, "").length > 40) { parts.push(`[Страница: ${link}]\n${t}`); pages.push(link) }
    }
  }

  let text = parts.join("\n\n")
  if (text.length > MAX_TOTAL_CHARS) text = text.slice(0, MAX_TOTAL_CHARS)
  return { ok: true, text, pages }
}
