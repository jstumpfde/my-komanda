import { eq, and, desc, sql, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiUsageLog, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Soft monthly token cap — no tariff wiring yet. Plug real plan limits here later.
const DEFAULT_MONTHLY_LIMIT = 2_000_000

export async function GET() {
  try {
    const user = await requireCompany()

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    const startOf30Days = new Date(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate())

    // Aggregate totals for today and month in a single query pass.
    const [totals] = await db
      .select({
        todayInput: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfToday} THEN ${aiUsageLog.inputTokens} ELSE 0 END), 0)::int`,
        todayOutput: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfToday} THEN ${aiUsageLog.outputTokens} ELSE 0 END), 0)::int`,
        todayCost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfToday} THEN ${aiUsageLog.costUsd}::numeric ELSE 0 END), 0)::text`,
        monthInput: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfMonth} THEN ${aiUsageLog.inputTokens} ELSE 0 END), 0)::int`,
        monthOutput: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfMonth} THEN ${aiUsageLog.outputTokens} ELSE 0 END), 0)::int`,
        monthCost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLog.createdAt} >= ${startOfMonth} THEN ${aiUsageLog.costUsd}::numeric ELSE 0 END), 0)::text`,
      })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.tenantId, user.companyId))

    const todayTokens = (totals?.todayInput ?? 0) + (totals?.todayOutput ?? 0)
    const monthTokens = (totals?.monthInput ?? 0) + (totals?.monthOutput ?? 0)

    // Daily breakdown for the last 30 days
    const dailyRows = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${aiUsageLog.createdAt}), 'YYYY-MM-DD')`,
        tokens: sql<number>`COALESCE(SUM(${aiUsageLog.inputTokens} + ${aiUsageLog.outputTokens}), 0)::int`,
        cost: sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}::numeric), 0)::text`,
      })
      .from(aiUsageLog)
      .where(
        and(
          eq(aiUsageLog.tenantId, user.companyId),
          gte(aiUsageLog.createdAt, startOf30Days),
        ),
      )
      .groupBy(sql`date_trunc('day', ${aiUsageLog.createdAt})`)
      .orderBy(sql`date_trunc('day', ${aiUsageLog.createdAt})`)

    const byDate = new Map(dailyRows.map((r) => [r.date, r]))
    const daily: { date: string; tokens: number; cost: number }[] = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(startOf30Days.getTime() + i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      const row = byDate.get(key)
      daily.push({
        date: key,
        tokens: row?.tokens ?? 0,
        cost: row ? Number(row.cost) : 0,
      })
    }

    // Recent requests
    const recent = await db
      .select({
        id: aiUsageLog.id,
        action: aiUsageLog.action,
        inputTokens: aiUsageLog.inputTokens,
        outputTokens: aiUsageLog.outputTokens,
        model: aiUsageLog.model,
        costUsd: aiUsageLog.costUsd,
        createdAt: aiUsageLog.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(aiUsageLog)
      .leftJoin(users, eq(users.id, aiUsageLog.userId))
      .where(eq(aiUsageLog.tenantId, user.companyId))
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(50)

    return apiSuccess({
      today: {
        tokens: todayTokens,
        cost: Number(totals?.todayCost ?? "0"),
      },
      month: {
        tokens: monthTokens,
        cost: Number(totals?.monthCost ?? "0"),
      },
      limit: DEFAULT_MONTHLY_LIMIT,
      daily,
      recent,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai/usage GET]", err)
    return apiError("Internal server error", 500)
  }
}
