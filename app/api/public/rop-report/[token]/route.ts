// GET  /api/public/rop-report/[token] — публичный (без логина) дашборд AI-РОП
//   по share-токену. companyId резолвится ИЗ ЗАПИСИ токена (rop_report_shares),
//   НИКОГДА из query — иначе можно было бы подставить чужой companyId.
//   Query: from/to (YYYY-MM-DD), managerId, withCrmOnly=1.
//
// POST /api/public/rop-report/[token] — трекер просмотра (аналог HR-отчёта,
//   см. app/api/public/report/[token]). Ставит зрителю cookie
//   rop_report_viewer (анонимный id), троттлит 10 мин (report-views.ts),
//   пишет в rop_report_views. Body: { kind?: "dashboard" | "tv" }.
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { apiError } from "@/lib/api-helpers"
import { resolveCompanyByToken } from "@/lib/ai-rop/dashboard-share"
import { recordView } from "@/lib/ai-rop/report-views"
import { loadDashboardData } from "@/lib/ai-rop/dashboard-data"

const VIEWER_COOKIE = "rop_report_viewer"

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params
    if (!token) return apiError("token обязателен", 400)

    const companyId = await resolveCompanyByToken(token)
    if (!companyId) return apiError("Ссылка не найдена или отозвана", 404)

    const url = new URL(req.url)
    const from = url.searchParams.get("from") || undefined
    const to = url.searchParams.get("to") || undefined
    const managerId = url.searchParams.get("managerId") || undefined
    const withCrmOnly = url.searchParams.get("withCrmOnly") === "1"

    const data = await loadDashboardData({ tenantId: companyId, from, to, managerId, withCrmOnly })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[public/rop-report] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params
    if (!token) return apiError("token обязателен", 400)

    const companyId = await resolveCompanyByToken(token)
    if (!companyId) return apiError("Ссылка не найдена или отозвана", 404)

    const body = (await req.json().catch(() => ({}))) as { kind?: string }
    const kind = body.kind === "tv" ? "tv" : "dashboard"

    const jar = await cookies()
    let viewerId = jar.get(VIEWER_COOKIE)?.value
    const res = NextResponse.json({ ok: true })
    if (!viewerId) {
      viewerId = crypto.randomBytes(16).toString("hex")
      res.cookies.set(VIEWER_COOKIE, viewerId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      })
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null
    const userAgent = req.headers.get("user-agent")

    try {
      await recordView({ tenantId: companyId, token, viewerId, kind, ip, userAgent })
    } catch (e) {
      console.error("[public/rop-report] record view failed:", (e as Error).message)
    }

    return res
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[public/rop-report] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
