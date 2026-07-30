// POST /api/modules/ai-rop/calls/bulk-enrich — массово подтянуть названия
// сделок/лидов/контактов для звонков компании, у которых их ещё нет (лимит 200
// за прогон, пауза 200мс между вызовами Bitrix — щадим rate-limit).
// Доступ: requireRopManage (директор) — массовая операция.
import { NextResponse } from "next/server"
import { and, eq, isNotNull, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient, formatContactName } from "@/lib/ai-rop/bitrix"

export const maxDuration = 300

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST() {
  try {
    const user = await requireRopManage()

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)
    const portalUrl = client.getPortalUrl()

    const rows = await db
      .select({
        id: ropCalls.id,
        bitrixDealId: ropCalls.bitrixDealId,
        bitrixLeadId: ropCalls.bitrixLeadId,
        bitrixContactId: ropCalls.bitrixContactId,
      })
      .from(ropCalls)
      .where(
        and(
          eq(ropCalls.tenantId, user.companyId),
          or(
            isNotNull(ropCalls.bitrixDealId),
            isNotNull(ropCalls.bitrixLeadId),
            isNotNull(ropCalls.bitrixContactId),
          ),
          isNull(ropCalls.bitrixDealTitle),
          isNull(ropCalls.bitrixLeadTitle),
          isNull(ropCalls.bitrixPortalUrl),
        ),
      )
      .limit(200)

    let processed = 0
    let errors = 0
    for (const row of rows) {
      try {
        let dealTitle: string | null = null
        let leadTitle: string | null = null
        let contactName: string | null = null

        if (row.bitrixDealId) {
          const d = await client.crmDealGet(row.bitrixDealId)
          dealTitle = d?.TITLE ?? null
        }
        if (row.bitrixLeadId) {
          const l = await client.crmLeadGet(row.bitrixLeadId)
          leadTitle = l ? l.TITLE || [l.NAME, l.LAST_NAME].filter(Boolean).join(" ") || null : null
        }
        if (row.bitrixContactId) {
          const c = await client.crmContactGet(row.bitrixContactId)
          if (c) contactName = formatContactName(c)
        }

        await db
          .update(ropCalls)
          .set({ bitrixDealTitle: dealTitle, bitrixLeadTitle: leadTitle, bitrixContactName: contactName, bitrixPortalUrl: portalUrl })
          .where(and(eq(ropCalls.id, row.id), eq(ropCalls.tenantId, user.companyId)))
        processed++
      } catch (e) {
        console.warn(`[ai-rop/bulk-enrich] звонок ${row.id}:`, (e as Error).message)
        errors++
      }
      if (processed + errors < rows.length) await sleep(200)
    }

    return NextResponse.json({ ok: true, processed, errors })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/bulk-enrich] error:", err)
    return apiError("Internal server error", 500)
  }
}
