// POST /api/modules/ai-rop/calls/reattribute-managers
// Body: { fromDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD" }
//
// Пересчитывает manager_id для уже импортированных звонков компании: если есть
// bitrixActivityId — берём актуальный RESPONSIBLE_ID активности из Bitrix.
// Доступ: requireRopManage (директор).
import { NextResponse } from "next/server"
import { and, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { backfillManagerNames } from "@/lib/ai-rop/managers"

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { fromDate?: string; toDate?: string }
    if (!body.fromDate) return apiError("fromDate обязателен (YYYY-MM-DD)", 400)
    const toDate = body.toDate || body.fromDate

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const t0 = Date.now()
    const activityResponsible = await client.crmCallActivitiesByPeriod({ fromDate: body.fromDate, toDate })

    const calls = await db
      .select({ id: ropCalls.id, bitrixActivityId: ropCalls.bitrixActivityId, managerId: ropCalls.managerId })
      .from(ropCalls)
      .where(
        and(
          eq(ropCalls.tenantId, user.companyId),
          gte(sql`substr(${ropCalls.startedAt}::text, 1, 10)`, body.fromDate),
          lte(sql`substr(${ropCalls.startedAt}::text, 1, 10)`, toDate),
          isNotNull(ropCalls.bitrixActivityId),
          ne(ropCalls.bitrixActivityId, "0"),
        ),
      )

    let updated = 0
    let unchanged = 0
    for (const c of calls) {
      const newMgr = c.bitrixActivityId ? activityResponsible.get(c.bitrixActivityId) : undefined
      if (newMgr && newMgr !== c.managerId) {
        await db
          .update(ropCalls)
          .set({ managerId: newMgr, managerName: null })
          .where(and(eq(ropCalls.id, c.id), eq(ropCalls.tenantId, user.companyId)))
        updated++
      } else {
        unchanged++
      }
    }

    let managers: { uniqueIds: number; fetched: number; updatedCalls: number } | null = null
    try {
      managers = await backfillManagerNames(client, user.companyId)
    } catch (e) {
      console.warn("[ai-rop/reattribute-managers] backfillManagerNames failed:", (e as Error).message)
    }

    return NextResponse.json({
      ok: true,
      processed: calls.length,
      updated,
      unchanged,
      activitiesFound: activityResponsible.size,
      managers,
      durationMs: Date.now() - t0,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/reattribute-managers] error:", err)
    return apiError("Internal server error", 500)
  }
}
