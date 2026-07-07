// /api/admin/tip/runs — последние прогоны «Типологии» + агрегаты (прогоны и юзеры).
// Гейт — тот же паттерн, что /admin/platform: requireAdminPanelAccess.

import { NextRequest, NextResponse } from "next/server"
import { desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipRuns, tipUsers } from "@/lib/db/schema"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { searchParams } = new URL(req.url)
  const limitParam = Number(searchParams.get("limit"))
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50

  const rows = await db
    .select({
      id:          tipRuns.id,
      userId:      tipRuns.userId,
      inputJson:   tipRuns.inputJson,
      status:      tipRuns.status,
      tokensIn:    tipRuns.tokensIn,
      tokensOut:   tipRuns.tokensOut,
      costUsd:     tipRuns.costUsd,
      shareToken:  tipRuns.shareToken,
      createdAt:   tipRuns.createdAt,
      finishedAt:  tipRuns.finishedAt,
    })
    .from(tipRuns)
    .orderBy(desc(tipRuns.createdAt))
    .limit(limit)

  const [{ total, todayCount, totalCostUsd }] = await db
    .select({
      total:         sql<number>`count(*)`.mapWith(Number),
      todayCount:    sql<number>`count(*) filter (where ${tipRuns.createdAt} >= date_trunc('day', now()))`.mapWith(Number),
      totalCostUsd:  sql<string>`coalesce(sum(${tipRuns.costUsd}), 0)`,
    })
    .from(tipRuns)

  const [{ usersTotal, usersWithBalance, balanceSum }] = await db
    .select({
      usersTotal:        sql<number>`count(*)`.mapWith(Number),
      usersWithBalance:  sql<number>`count(*) filter (where ${tipUsers.balanceRuns} > 0)`.mapWith(Number),
      balanceSum:        sql<number>`coalesce(sum(${tipUsers.balanceRuns}), 0)`.mapWith(Number),
    })
    .from(tipUsers)

  return NextResponse.json({
    runs: rows,
    stats: {
      total,
      today: todayCount,
      totalCostUsd,
    },
    users: {
      total: usersTotal,
      withBalance: usersWithBalance,
      balanceSum,
    },
  })
}
