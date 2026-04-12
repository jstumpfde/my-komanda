import { NextRequest } from "next/server"
import { eq, and, sql, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesDeals } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { DEAL_STAGES } from "@/lib/crm/deal-stages"

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    // Агрегация по этапам
    const stageStats = await db
      .select({
        stage: salesDeals.stage,
        count: sql<number>`count(*)::int`,
        totalAmount: sql<number>`coalesce(sum(${salesDeals.amount}), 0)::int`,
      })
      .from(salesDeals)
      .where(eq(salesDeals.tenantId, user.companyId))
      .groupBy(salesDeals.stage)

    const byStage: Record<string, { count: number; totalAmount: number }> = {}
    for (const stage of DEAL_STAGES) {
      byStage[stage.id] = { count: 0, totalAmount: 0 }
    }
    for (const row of stageStats) {
      if (row.stage) byStage[row.stage] = { count: row.count, totalAmount: row.totalAmount }
    }

    // Всего сделок
    const totalDeals = stageStats.reduce((sum, r) => sum + r.count, 0)

    // Сумма в работе (не won/lost)
    const activeAmount = stageStats
      .filter((r) => r.stage !== "won" && r.stage !== "lost")
      .reduce((sum, r) => sum + r.totalAmount, 0)

    // Выиграно за текущий месяц
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [wonThisMonth] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalAmount: sql<number>`coalesce(sum(${salesDeals.amount}), 0)::int`,
      })
      .from(salesDeals)
      .where(
        and(
          eq(salesDeals.tenantId, user.companyId),
          eq(salesDeals.stage, "won"),
          gte(salesDeals.closedAt, monthStart),
        ),
      )

    // Конверсия за текущий месяц (won / (won + lost))
    const [lostThisMonth] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(salesDeals)
      .where(
        and(
          eq(salesDeals.tenantId, user.companyId),
          eq(salesDeals.stage, "lost"),
          gte(salesDeals.closedAt, monthStart),
        ),
      )

    const wonCount = wonThisMonth?.count ?? 0
    const lostCount = lostThisMonth?.count ?? 0
    const conversion = wonCount + lostCount > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100)
      : 0

    return apiSuccess({
      totalDeals,
      activeAmount,
      wonThisMonth: {
        count: wonCount,
        amount: wonThisMonth?.totalAmount ?? 0,
      },
      conversion,
      byStage,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
