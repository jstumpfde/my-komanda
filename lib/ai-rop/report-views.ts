/**
 * Журнал просмотров публичного дашборда/отчёта AI-РОП (ссылка руководителю).
 *
 * Каждый заход на `/rop-report/[token]` (фаза 4, UI) клиентский трекер шлёт
 * POST на `/api/public/ai-rop/report-view` (фаза 3) — тут пишем строку (с
 * троттлингом 10 мин на зрителя, чтобы автообновление не раздувало счётчик).
 * Владелец видит сводку в попапе «Поделиться»: сколько заходов, последний
 * визит, регулярность, недавние заходы.
 *
 * Порт call-agent lib/report-views.ts. Отличия: таблица rop_report_views уже
 * создана миграцией 0276 (не lazy CREATE TABLE IF NOT EXISTS, как в
 * оригинале) — только PG; tenantId — uuid; getTenantName читает companies
 * (платформенная таблица) вместо call-agent tenants.
 */
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReportViews, companies } from "@/lib/db/schema"

/**
 * Записать заход. Троттлинг: если этот же viewer смотрел этот token за последние
 * 10 минут — не дублируем. Возвращает true если новая запись создана.
 */
export async function recordView(opts: {
  tenantId: string
  token: string
  viewerId: string
  kind?: string
  ip?: string | null
  userAgent?: string | null
}): Promise<boolean> {
  const recentRows = (await db.execute(sql`
    SELECT id FROM rop_report_views
    WHERE viewer_id = ${opts.viewerId} AND token = ${opts.token}
      AND viewed_at >= NOW() - INTERVAL '10 minute'
    LIMIT 1
  `)) as unknown as Array<{ id: string }>
  if (recentRows.length > 0) return false

  await db.insert(ropReportViews).values({
    tenantId: opts.tenantId,
    token: opts.token,
    viewerId: opts.viewerId,
    kind: opts.kind ?? "dashboard",
    ip: opts.ip ?? null,
    userAgent: (opts.userAgent ?? null)?.slice(0, 300) ?? null,
  })
  return true
}

export interface ReportViewStats {
  total30d: number
  uniqueViewers30d: number
  lastViewedAt: string | null
  perDay: { date: string; count: number }[] // последние 14 дней
  recent: { viewedAt: string; kind: string; device: string; ipMasked: string | null }[]
  activeDays30d: number // сколько разных дней были заходы (регулярность)
}

/** Сводка для владельца — коротко, без «портянок». */
export async function getViewStats(tenantId: string): Promise<ReportViewStats> {
  const [totalRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n, COUNT(DISTINCT viewer_id)::int AS u
    FROM rop_report_views
    WHERE tenant_id = ${tenantId}::uuid AND viewed_at >= NOW() - INTERVAL '30 day'
  `)) as unknown as Array<{ n: number; u: number }>

  const [lastRow] = (await db.execute(sql`
    SELECT MAX(viewed_at)::text AS last FROM rop_report_views WHERE tenant_id = ${tenantId}::uuid
  `)) as unknown as Array<{ last: string | null }>

  const dayRows = (await db.execute(sql`
    SELECT substr(viewed_at::text, 1, 10) AS d, COUNT(*)::int AS n
    FROM rop_report_views
    WHERE tenant_id = ${tenantId}::uuid AND viewed_at >= NOW() - INTERVAL '14 day'
    GROUP BY substr(viewed_at::text, 1, 10)
    ORDER BY d
  `)) as unknown as Array<{ d: string; n: number }>

  const [activeRow] = (await db.execute(sql`
    SELECT COUNT(DISTINCT substr(viewed_at::text, 1, 10))::int AS days
    FROM rop_report_views
    WHERE tenant_id = ${tenantId}::uuid AND viewed_at >= NOW() - INTERVAL '30 day'
  `)) as unknown as Array<{ days: number }>

  const recentRows = (await db.execute(sql`
    SELECT viewed_at::text AS viewed_at, kind AS kind, ip AS ip, user_agent AS user_agent
    FROM rop_report_views
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY viewed_at DESC
    LIMIT 12
  `)) as unknown as Array<{ viewed_at: string; kind: string; ip: string | null; user_agent: string | null }>

  // Собираем per-day за 14 дней с нулями
  const byDay = new Map(dayRows.map((r) => [r.d, Number(r.n)]))
  const perDay: { date: string; count: number }[] = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    perDay.push({ date: key, count: byDay.get(key) ?? 0 })
  }

  return {
    total30d: Number(totalRow?.n ?? 0),
    uniqueViewers30d: Number(totalRow?.u ?? 0),
    lastViewedAt: lastRow?.last ?? null,
    activeDays30d: Number(activeRow?.days ?? 0),
    perDay,
    recent: recentRows.map((r) => ({
      viewedAt: r.viewed_at,
      kind: r.kind,
      device: detectDevice(r.user_agent),
      ipMasked: maskIp(r.ip),
    })),
  }
}

/** Имя компании для шапки публичного отчёта. */
export async function getTenantName(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, tenantId))
    .limit(1)
  return row?.name?.trim() || "Отчёт"
}

function detectDevice(ua: string | null): string {
  if (!ua) return "—"
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return "Телефон"
  if (/iPad|Tablet/i.test(ua)) return "Планшет"
  if (/Windows|Macintosh|Linux|X11/i.test(ua)) return "Компьютер"
  return "—"
}

function maskIp(ip: string | null): string | null {
  if (!ip) return null
  // Берём первый адрес из x-forwarded-for и маскируем последний октет
  const first = ip.split(",")[0].trim()
  const m = first.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/)
  if (m) return `${m[1]}.${m[2]}.${m[3]}.×`
  return first.length > 12 ? first.slice(0, 12) + "…" : first
}
