// POST /api/public/client-pages/track — приём тиков аналитики от клиентских
// страниц витрины (newsite.company24.pro/<slug>). Публичный, fire-and-forget.
//
// Страницы на другом поддомене → cross-origin. Инлайн-трекер шлёт Content-Type
// text/plain (простой CORS-запрос, без preflight) либо navigator.sendBeacon.
// Всегда отвечаем 200 {} и ставим CORS-заголовки, чтобы ничего не мешало
// рендеру страницы клиента.

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { recordView } from "@/lib/platform/client-pages-analytics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const secret = process.env.NEXTAUTH_SECRET || ""
  return createHash("sha256").update(ip + secret).digest("hex").slice(0, 32)
}

export async function POST(req: NextRequest) {
  try {
    // трекер шлёт text/plain — читаем как текст и парсим JSON вручную
    const raw = await req.text()
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(raw) } catch { return NextResponse.json({}, { headers: CORS }) }

    const ip =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null

    await recordView({
      slug: String(body.slug ?? ""),
      path: String(body.path ?? ""),
      visitorId: String(body.visitorId ?? ""),
      recipient: body.recipient != null ? String(body.recipient) : null,
      source: body.source != null ? String(body.source) : null,
      referrer: body.referrer != null ? String(body.referrer) : null,
      userAgent: req.headers.get("user-agent"),
      screen: body.screen != null ? String(body.screen) : null,
      ipHash: hashIp(ip),
      addSeconds: typeof body.addSeconds === "number" ? body.addSeconds : 0,
      scrollPct: typeof body.scrollPct === "number" ? body.scrollPct : 0,
    })
  } catch (e) {
    console.error("[client-pages] POST track", e)
  }
  return NextResponse.json({}, { headers: CORS })
}
