// GET /go/{code} — редирект по трекинг-ссылке из Telegram-поста.
// Публичный роут (без сессии) — см. middleware.ts PUBLIC_PREFIXES ("/go/").
// Инкрементит clicks, логирует telegram_link_clicks (ip_hash = sha256(ip+соль
// из NEXTAUTH_SECRET), сырой IP не храним, user_agent — до 250 симв.).
// Неизвестный code → редирект на https://company24.pro.

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostLinks, telegramLinkClicks } from "@/lib/db/schema"

const FALLBACK_URL = "https://company24.pro"

function hashIp(ip: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
  return createHash("sha256").update(`${ip}:${secret}`).digest("hex")
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return req.headers.get("x-real-ip") || "unknown"
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  try {
    const [link] = await db
      .select()
      .from(telegramPostLinks)
      .where(eq(telegramPostLinks.code, code))
      .limit(1)

    if (!link) {
      return NextResponse.redirect(FALLBACK_URL, { status: 302 })
    }

    const ip = getClientIp(req)
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 250)

    await Promise.all([
      db
        .update(telegramPostLinks)
        .set({ clicks: sql`${telegramPostLinks.clicks} + 1` })
        .where(eq(telegramPostLinks.id, link.id)),
      db.insert(telegramLinkClicks).values({
        linkId: link.id,
        userAgent: userAgent || null,
        ipHash: ip !== "unknown" ? hashIp(ip) : null,
      }),
    ])

    return NextResponse.redirect(link.targetUrl, { status: 302 })
  } catch (err) {
    console.error("[go/:code] GET", err)
    return NextResponse.redirect(FALLBACK_URL, { status: 302 })
  }
}
