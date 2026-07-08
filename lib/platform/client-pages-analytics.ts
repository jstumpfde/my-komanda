// Аналитика просмотров клиентских страниц витрины.
//
// recordView — накопительный upsert по визиту (slug+path+visitor_id), как в
// tip_share_views: время видимости и максимальная прокрутка копятся по тикам.
// getStats — сводка по одному сайту витрины для кабинета админа.

import { and, eq, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { clientPageViews, type ClientPageView } from "@/lib/db/schema"

const MAX_SECONDS = 3600 // потолок накопления на визит — 1 час (защита от «оставил вкладку»)

export interface RecordViewInput {
  slug: string
  path: string
  visitorId: string
  recipient?: string | null
  source?: string | null
  referrer?: string | null
  userAgent?: string | null
  screen?: string | null
  ipHash?: string | null
  addSeconds?: number // 0..30 за тик
  scrollPct?: number  // 0..100
}

function clamp(n: number | undefined, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

export async function recordView(input: RecordViewInput): Promise<void> {
  try {
    const slug = (input.slug || "").trim()
    const path = (input.path || "").trim().slice(0, 512)
    const visitorId = (input.visitorId || "").trim().slice(0, 128)
    if (!slug || !path || !visitorId) return

    const addSeconds = clamp(input.addSeconds, 0, 30)
    const scrollPct = clamp(input.scrollPct, 0, 100)
    const recipient = input.recipient?.trim().slice(0, 120) || null
    const source = input.source?.trim().slice(0, 120) || null
    const referrer = input.referrer?.trim().slice(0, 512) || null
    const userAgent = input.userAgent?.trim().slice(0, 512) || null
    const screen = input.screen?.trim().slice(0, 32) || null
    const ipHash = input.ipHash?.trim().slice(0, 128) || null

    const [existing] = await db
      .select()
      .from(clientPageViews)
      .where(
        and(
          eq(clientPageViews.slug, slug),
          eq(clientPageViews.path, path),
          eq(clientPageViews.visitorId, visitorId),
        ),
      )
      .limit(1)

    if (existing) {
      await db
        .update(clientPageViews)
        .set({
          secondsVisible: Math.min(existing.secondsVisible + addSeconds, MAX_SECONDS),
          maxScrollPct: Math.max(existing.maxScrollPct, scrollPct),
          lastAt: new Date(),
          // первые непустые значения — авторитетные (откуда пришли, кому слали)
          recipient: existing.recipient ?? recipient,
          source: existing.source ?? source,
          referrer: existing.referrer ?? referrer,
          userAgent: existing.userAgent ?? userAgent,
          screen: existing.screen ?? screen,
          ipHash: existing.ipHash ?? ipHash,
        })
        .where(eq(clientPageViews.id, existing.id))
      return
    }

    const inserted = await db
      .insert(clientPageViews)
      .values({
        slug, path, visitorId, recipient, source, referrer, userAgent, screen, ipHash,
        secondsVisible: addSeconds,
        maxScrollPct: scrollPct,
      })
      .onConflictDoNothing({
        target: [clientPageViews.slug, clientPageViews.path, clientPageViews.visitorId],
      })
      .returning({ id: clientPageViews.id })

    // гонка двух первых тиков — досчитать как update
    if (inserted.length === 0) await recordView(input)
  } catch (e) {
    console.error("[client-pages] recordView", e)
  }
}

// ─── Агрегация для кабинета ──────────────────────────────────────────────

export interface PageStat {
  path: string
  label: string
  visitors: number
  avgScrollPct: number
  avgSeconds: number
}

export interface VisitorStat {
  visitorId: string
  recipient: string | null
  device: string
  source: string | null
  pages: number
  totalSeconds: number
  maxScrollPct: number
  firstAt: string
  lastAt: string
}

export interface ClientPageStats {
  slug: string
  totals: {
    visitors: number
    pageOpens: number   // уникальные (посетитель × страница)
    totalSeconds: number
    avgSecondsPerVisitor: number
    avgScrollPct: number
    lastAt: string | null
  }
  pages: PageStat[]
  visitors: VisitorStat[]
}

// Красивое имя страницы из path: "/biglife/" → "Главная",
// "/biglife/Big Life TV.dc.html" → "Big Life TV".
export function prettifyPath(slug: string, rawPath: string): string {
  let p = rawPath
  try { p = decodeURIComponent(rawPath) } catch { /* оставляем как есть */ }
  p = p.replace(new RegExp(`^/${slug}/?`), "")
  p = p.replace(/\.dc\.html$/i, "").replace(/\.html$/i, "")
  p = p.replace(/\bindex$/i, "").replace(/\/+$/, "")
  return p.trim() || "Главная"
}

function detectDevice(ua: string | null): string {
  if (!ua) return "—"
  const s = ua.toLowerCase()
  const mobile = /mobile|iphone|android|ipad|ipod/.test(s)
  let br = "браузер"
  if (s.includes("edg/")) br = "Edge"
  else if (s.includes("chrome") && !s.includes("edg/")) br = "Chrome"
  else if (s.includes("safari") && !s.includes("chrome")) br = "Safari"
  else if (s.includes("firefox")) br = "Firefox"
  else if (s.includes("yabrowser")) br = "Яндекс"
  return `${mobile ? "📱" : "💻"} ${br}`
}

export async function getStats(slug: string, opts?: { visitorLimit?: number }): Promise<ClientPageStats> {
  const rows: ClientPageView[] = await db
    .select()
    .from(clientPageViews)
    .where(eq(clientPageViews.slug, slug))
    .orderBy(desc(clientPageViews.lastAt))
    .limit(5000)

  // по страницам
  const byPath = new Map<string, ClientPageView[]>()
  // по посетителям
  const byVisitor = new Map<string, ClientPageView[]>()
  for (const r of rows) {
    ;(byPath.get(r.path) ?? byPath.set(r.path, []).get(r.path)!).push(r)
    ;(byVisitor.get(r.visitorId) ?? byVisitor.set(r.visitorId, []).get(r.visitorId)!).push(r)
  }

  const pages: PageStat[] = [...byPath.entries()]
    .map(([path, rs]) => ({
      path,
      label: prettifyPath(slug, path),
      visitors: new Set(rs.map(r => r.visitorId)).size,
      avgScrollPct: Math.round(rs.reduce((a, r) => a + r.maxScrollPct, 0) / rs.length),
      avgSeconds: Math.round(rs.reduce((a, r) => a + r.secondsVisible, 0) / rs.length),
    }))
    .sort((a, b) => b.visitors - a.visitors)

  const visitorLimit = opts?.visitorLimit ?? 100
  const visitors: VisitorStat[] = [...byVisitor.entries()]
    .map(([visitorId, rs]) => {
      const first = rs.reduce((m, r) => (r.firstAt < m ? r.firstAt : m), rs[0].firstAt)
      const last = rs.reduce((m, r) => (r.lastAt > m ? r.lastAt : m), rs[0].lastAt)
      return {
        visitorId,
        recipient: rs.find(r => r.recipient)?.recipient ?? null,
        device: detectDevice(rs.find(r => r.userAgent)?.userAgent ?? null),
        source: rs.find(r => r.source)?.source ?? null,
        pages: new Set(rs.map(r => r.path)).size,
        totalSeconds: rs.reduce((a, r) => a + r.secondsVisible, 0),
        maxScrollPct: rs.reduce((a, r) => Math.max(a, r.maxScrollPct), 0),
        firstAt: first.toISOString(),
        lastAt: last.toISOString(),
      }
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, visitorLimit)

  const totalVisitors = byVisitor.size
  const totalSeconds = rows.reduce((a, r) => a + r.secondsVisible, 0)
  const lastAt = rows.length ? rows[0].lastAt.toISOString() : null

  return {
    slug,
    totals: {
      visitors: totalVisitors,
      pageOpens: rows.length,
      totalSeconds,
      avgSecondsPerVisitor: totalVisitors ? Math.round(totalSeconds / totalVisitors) : 0,
      avgScrollPct: rows.length ? Math.round(rows.reduce((a, r) => a + r.maxScrollPct, 0) / rows.length) : 0,
      lastAt,
    },
    pages,
    visitors,
  }
}
