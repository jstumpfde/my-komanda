// Витрина клиентских страниц (newsite.company24.pro).
//
// Статические HTML-страницы для клиентов живут файлами на сервере:
//   <CLIENT_PAGES_DIR>/<slug>/index.html  →  <CLIENT_PAGES_BASE_URL>/<slug>
// nginx отдаёт их статикой (см. /etc/nginx/sites-available/newsite.company24.pro).
//
// Этот модуль — тонкая fs-обёртка: список / чтение / запись / удаление.
// Пишет только платформенный админ через /admin/platform/client-pages.

import { promises as fs } from "fs"
import path from "path"
import { injectTracking, stripTracking } from "@/lib/platform/client-pages-tracking"

const ROOT = process.env.CLIENT_PAGES_DIR || "/var/www/client-pages"
const BASE_URL = (process.env.CLIENT_PAGES_BASE_URL || "https://newsite.company24.pro").replace(/\/+$/, "")

// Слаг = один сегмент пути: строчные латиница/цифры/дефис, 1..64.
// Отсекает traversal (нет точек и слэшей) — это основной барьер безопасности.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export const MAX_HTML_BYTES = 5 * 1024 * 1024 // 5 МБ на страницу

export function isValidSlug(slug: string): boolean {
  return typeof slug === "string" && SLUG_RE.test(slug)
}

export function normalizeSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")   // пробелы/подчёркивания → дефис
    .replace(/[^a-z0-9-]/g, "") // выкидываем всё остальное
    .replace(/-+/g, "-")        // схлопываем дефисы
    .replace(/^-+|-+$/g, "")    // без дефисов по краям
    .slice(0, 64)
}

export function publicUrl(slug: string): string {
  return `${BASE_URL}/${slug}`
}

function pageDir(slug: string): string {
  if (!isValidSlug(slug)) throw new Error("invalid slug")
  return path.join(ROOT, slug)
}

export interface ClientPageMeta {
  slug: string
  url: string
  size: number
  updatedAt: string // ISO
}

export async function listPages(): Promise<ClientPageMeta[]> {
  let entries
  try {
    entries = await fs.readdir(ROOT, { withFileTypes: true })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
  const out: ClientPageMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory() || !isValidSlug(e.name)) continue
    try {
      const st = await fs.stat(path.join(ROOT, e.name, "index.html"))
      out.push({
        slug: e.name,
        url: publicUrl(e.name),
        size: st.size,
        updatedAt: st.mtime.toISOString(),
      })
    } catch {
      // папка без index.html — пропускаем
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

export async function pageExists(slug: string): Promise<boolean> {
  try {
    await fs.stat(path.join(pageDir(slug), "index.html"))
    return true
  } catch {
    return false
  }
}

// Возвращает HTML или null, если страницы нет. Встроенный блок аналитики
// вырезаем — в редакторе показываем «чистый» HTML, каким его вставил админ.
export async function readPage(slug: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(pageDir(slug), "index.html"), "utf8")
    return stripTracking(raw)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

// При записи встраиваем инлайн-аналитику (идемпотентно) — чтобы видеть
// просмотры/скролл/время по отправленной клиенту ссылке.
export async function writePage(slug: string, html: string): Promise<void> {
  const dir = pageDir(slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "index.html"), injectTracking(html, slug), "utf8")
}

export async function deletePage(slug: string): Promise<void> {
  await fs.rm(pageDir(slug), { recursive: true, force: true })
}
