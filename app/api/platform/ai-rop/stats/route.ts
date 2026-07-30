// Platform Admin → AI-РОП → Статистика: агрегат за 30 дней.
// Источники: rop_calls (звонков обработано/компаний активно) + ai_usage_log
// по action LIKE 'rop_%' (AI-расход, computeCostUsd — как в /api/ai/usage).
import { NextResponse } from "next/server"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, aiUsageLog, companies } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate

  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [callsTotals] = await db
      .select({
        callsProcessed: sql<number>`COUNT(*) FILTER (WHERE ${ropCalls.status} = 'done')::int`,
        callsTotal: sql<number>`COUNT(*)::int`,
        companiesActive: sql<number>`COUNT(DISTINCT ${ropCalls.tenantId})::int`,
      })
      .from(ropCalls)
      .where(gte(ropCalls.createdAt, since30d))

    const [aiTotals] = await db
      .select({
        aiCalls: sql<number>`COUNT(*)::int`,
        aiCostUsd: sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}::numeric), 0)::text`,
      })
      .from(aiUsageLog)
      .where(and(sql`${aiUsageLog.action} LIKE 'rop_%'`, gte(aiUsageLog.createdAt, since30d)))

    const topCompaniesRows = await db
      .select({
        companyId: aiUsageLog.tenantId,
        companyName: companies.name,
        costUsd: sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}::numeric), 0)::text`,
        calls: sql<number>`COUNT(*)::int`,
      })
      .from(aiUsageLog)
      .innerJoin(companies, eq(companies.id, aiUsageLog.tenantId))
      .where(and(sql`${aiUsageLog.action} LIKE 'rop_%'`, gte(aiUsageLog.createdAt, since30d)))
      .groupBy(aiUsageLog.tenantId, companies.name)
      .orderBy(desc(sql`COALESCE(SUM(${aiUsageLog.costUsd}::numeric), 0)`))
      .limit(10)

    return NextResponse.json({
      since: since30d.toISOString(),
      callsProcessed: callsTotals?.callsProcessed ?? 0,
      callsTotal: callsTotals?.callsTotal ?? 0,
      companiesActive: callsTotals?.companiesActive ?? 0,
      aiCalls: aiTotals?.aiCalls ?? 0,
      aiCostUsd: Number(aiTotals?.aiCostUsd ?? "0"),
      topCompanies: topCompaniesRows.map((r) => ({
        companyId: r.companyId,
        companyName: r.companyName,
        costUsd: Number(r.costUsd),
        calls: r.calls,
      })),
    })
  } catch (err) {
    console.error("[platform/ai-rop/stats GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
