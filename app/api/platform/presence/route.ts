import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { visitLog } from "@/lib/db/schema"
import { gte, desc } from "drizzle-orm"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// Платформенный журнал присутствия: кто сейчас на сайте (по всем компаниям),
// особенно кандидаты на демо/анкетах — для гейта безопасности деплоя.
//
// Доступ: session-email из PLATFORM_ADMIN_EMAILS (для UI) ИЛИ X-Platform-Admin-Key
// (для curl/cron). Иначе 404 (скрываем, как и /admin/platform).

const ONLINE_WINDOW_MS = 2 * 60 * 1000 // «онлайн» = визит за последние 2 минуты

function classify(page: string): { kind: string; candidate: boolean } {
  const p = (page || "").toLowerCase()
  if (p.startsWith("/demo/")) return { kind: "Демо кандидата", candidate: true }
  if (p.startsWith("/test/")) return { kind: "Тест-задание", candidate: true }
  if (p.startsWith("/vacancy-view/") || p.startsWith("/vacancy/") || p.startsWith("/v/")) return { kind: "Вакансия", candidate: true }
  if (p.includes("anketa") || p.startsWith("/schedule/")) return { kind: "Анкета / запись", candidate: true }
  if (p.startsWith("/hr") || p.startsWith("/sales") || p.startsWith("/admin") || p.startsWith("/settings") || p.startsWith("/marketing")) {
    return { kind: "Внутренние страницы", candidate: false }
  }
  return { kind: "Прочее", candidate: false }
}

export async function GET(req: NextRequest) {
  // Авторизация: ключ ИЛИ платформенный email.
  const key = req.headers.get("x-platform-admin-key")
  const keyOk = !!key && !!process.env.PLATFORM_ADMIN_KEY && key === process.env.PLATFORM_ADMIN_KEY
  if (!keyOk) {
    const session = await auth()
    if (!isPlatformAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const since = new Date(Date.now() - ONLINE_WINDOW_MS)

  // Свежие визиты по всем тенантам.
  const rows = await db
    .select({
      sessionId: visitLog.sessionId,
      page: visitLog.page,
      ip: visitLog.ip,
      userId: visitLog.userId,
      tenantId: visitLog.tenantId,
      createdAt: visitLog.createdAt,
    })
    .from(visitLog)
    .where(gte(visitLog.createdAt, since))
    .orderBy(desc(visitLog.createdAt))
    .limit(2000)

  // Дедуп по сессии (или ip, если сессии нет) — берём самый свежий (rows уже desc).
  const seen = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const key2 = r.sessionId || (r.ip ? `ip:${r.ip}` : `row:${r.createdAt?.toISOString()}:${r.page}`)
    if (!seen.has(key2)) seen.set(key2, r)
  }

  const online = [...seen.values()].map((r) => {
    const c = classify(r.page)
    return {
      sessionId: r.sessionId,
      page: r.page,
      kind: c.kind,
      candidate: c.candidate,
      ip: r.ip,
      authenticated: !!r.userId,
      lastSeen: r.createdAt,
    }
  })

  const candidateOnline = online.filter((o) => o.candidate)

  // Недавняя история заходов.
  const recent = await db
    .select({ page: visitLog.page, ip: visitLog.ip, userId: visitLog.userId, createdAt: visitLog.createdAt })
    .from(visitLog)
    .orderBy(desc(visitLog.createdAt))
    .limit(50)

  return NextResponse.json({
    totalOnline: online.length,
    candidateCount: candidateOnline.length,
    safeToDeploy: candidateOnline.length === 0,
    online,
    recent,
    windowMinutes: ONLINE_WINDOW_MS / 60000,
  })
}
