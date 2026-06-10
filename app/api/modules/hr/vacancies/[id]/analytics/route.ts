// GET /api/modules/hr/vacancies/[id]/analytics
//
// Серверная агрегация аналитики по ВСЕЙ вакансии (а не по выгруженной на
// клиент странице кандидатов). Раньше таб «Аналитика» считал всё из массива
// columns, который на вакансиях с серверной пагинацией неполный → метрики
// занижались и расходились с шапкой. Здесь агрегация делается в БД (GROUP BY /
// COUNT / AVG), логика total/стадий совпадает с lib/vacancy-stats.ts (та же,
// что в шапке через /stats), а средний скор берётся по РЕАЛЬНОМУ ai_score.
//
// Query: ?period=all|7d|30d|90d — единый фильтр по candidates.created_at для
// ВСЕХ блоков. period=all — без фильтра по дате.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { and, eq, sql, type SQL } from "drizzle-orm"
import { IN_PROGRESS_STAGE_SLUGS, DEMO_OPENED_STAGE_SLUGS } from "@/lib/stages"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id: vacancyId } = await ctx.params

  // Доступ как в /stats: вакансия должна принадлежать компании пользователя,
  // platform-роли видят всё.
  const [vac] = await db
    .select({ companyId: vacancies.companyId, createdAt: vacancies.createdAt })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

  const userRole = (session.user as { role?: string }).role
  const userCompanyId = (session.user as { companyId?: string }).companyId
  const isPlatform = userRole === "platform_admin" || userRole === "platform_manager"
  if (!isPlatform && (!userCompanyId || userCompanyId !== vac.companyId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // ── Период (единый фильтр для всех блоков) ──
  const periodParam = (new URL(_req.url).searchParams.get("period") || "all").toLowerCase()
  const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }
  const days = periodDays[periodParam]

  const conds: SQL[] = [eq(candidates.vacancyId, vacancyId)]
  if (days) {
    conds.push(sql`${candidates.createdAt} >= now() - (${days} * interval '1 day')`)
  }
  const whereCands = and(...conds)

  // ── Разбивка по stage (одним проходом) → total + воронка ──
  const stageRows = await db
    .select({ stage: candidates.stage, count: sql<number>`count(*)::int` })
    .from(candidates)
    .where(whereCands)
    .groupBy(candidates.stage)

  const stageCounts: Record<string, number> = {}
  let total = 0
  for (const r of stageRows) {
    const st = r.stage || "new"
    stageCounts[st] = (stageCounts[st] || 0) + r.count
    total += r.count
  }

  const sc = (k: string) => stageCounts[k] || 0
  const hired = sc("hired")
  const rejected = sc("rejected")
  // inProgress/demoOpened — теми же группами стадий, что и lib/vacancy-stats.ts
  // (которое питает шапку через /stats), чтобы цифры точно совпадали.
  const inProgress = IN_PROGRESS_STAGE_SLUGS.reduce((a, s) => a + sc(s), 0)
  const demoOpened = DEMO_OPENED_STAGE_SLUGS.reduce((a, s) => a + sc(s), 0)

  // Воронка — те же стадии/метки/цвета, что строил клиентский код из columns
  // (lib/column-config: new/demo/decision/interview/final_decision/hired),
  // с тем же кумулятивным счётом «дошли до этапа и дальше».
  const afterDecision = sc("interview") + sc("final_decision") + sc("hired")
  const funnelStages = [
    { stage: "Новый", count: total, color: "#94a3b8" },
    { stage: "Демо", count: total - sc("new"), color: "#3b82f6" },
    { stage: "Решение", count: sc("decision") + afterDecision, color: "#ef4444" },
    { stage: "Интервью", count: sc("interview") + sc("final_decision") + sc("hired"), color: "#8b5cf6" },
    { stage: "Финальное решение", count: sc("final_decision") + sc("hired"), color: "#f97316" },
    { stage: "Нанято", count: sc("hired"), color: "#22c55e" },
  ]

  // ── Источники: count + avg по РЕАЛЬНОМУ ai_score (NULL не в среднем) ──
  const sourceRows = await db
    .select({
      source: candidates.source,
      count: sql<number>`count(*)::int`,
      avgScore: sql<number | null>`round(avg(${candidates.aiScore}) filter (where ${candidates.aiScore} is not null))::int`,
    })
    .from(candidates)
    .where(whereCands)
    .groupBy(candidates.source)

  const sourceData = sourceRows
    .map((r) => ({
      source: r.source || "manual",
      count: r.count,
      avgScore: r.avgScore ?? 0,
      pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ── Распределение AI-скора (по реальному ai_score) ──
  // Бакеты совместимы с прежним UI: 0-40 / 41-70 / 71-100, плюс средний скор.
  const [bucketRow] = await db
    .select({
      low: sql<number>`count(*) filter (where ${candidates.aiScore} >= 0 and ${candidates.aiScore} <= 40)::int`,
      mid: sql<number>`count(*) filter (where ${candidates.aiScore} > 40 and ${candidates.aiScore} <= 70)::int`,
      high: sql<number>`count(*) filter (where ${candidates.aiScore} > 70)::int`,
      avgScore: sql<number | null>`round(avg(${candidates.aiScore}) filter (where ${candidates.aiScore} is not null))::int`,
    })
    .from(candidates)
    .where(whereCands)

  const scoreRanges = [
    { range: "0-40 (низкий)", count: bucketRow?.low ?? 0, color: "#ef4444" },
    { range: "41-70 (средний)", count: bucketRow?.mid ?? 0, color: "#f59e0b" },
    { range: "71-100 (высокий)", count: bucketRow?.high ?? 0, color: "#22c55e" },
  ]
  const avgScore = bucketRow?.avgScore ?? 0

  return NextResponse.json({
    period: periodParam,
    total,
    inProgress,
    rejected,
    hired,
    avgScore,
    demoOpened,
    vacancyCreatedAt: vac.createdAt,
    stageCounts,
    funnelStages,
    sourceData,
    scoreRanges,
  })
}
