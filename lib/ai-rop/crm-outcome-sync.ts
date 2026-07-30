/**
 * Синк финального статуса лида/сделки Bitrix для звонков — порт call-agent
 * lib/crm-outcome-sync.ts. Периодически подтягивает STATUS_ID/STAGE_ID и
 * сумму, сохраняет на rop_calls (leadStatusId/leadOpportunity/dealStageId/
 * dealOpportunity/crmOutcomeSyncedAt). Семантика STATUS_ID лида — стандартная
 * для Bitrix: JUNK=брак, CONVERTED=успех, остальное — в работе. Для сделок
 * STAGE_ID — портал-специфичный код, семантику won/lost здесь не угадываем.
 */
import { and, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import type { BitrixClient } from "./bitrix"

export interface CrmOutcomeSyncResult {
  leadsChecked: number
  dealsChecked: number
  errors: number
}

/** Пауза между запросами к Bitrix API, чтобы не улететь в rate-limit портала. */
const BITRIX_CALL_DELAY_MS = 180

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const STALE_THRESHOLD = sql`NOW() - interval '24 hours'`

/**
 * Синк финального статуса лидов/сделок Bitrix для одной компании. Берёт
 * только звонки, у которых lead/deal ещё ни разу не синкались или синкались
 * больше 24 часов назад — чтобы не долбить Bitrix API по кругу.
 */
export async function syncCrmOutcomes(
  client: BitrixClient,
  companyId: string,
  limit = 200
): Promise<CrmOutcomeSyncResult> {
  const result: CrmOutcomeSyncResult = { leadsChecked: 0, dealsChecked: 0, errors: 0 }

  // ── Лиды (основной объём) ───────────────────────────────────────────
  const leadRows = await db
    .selectDistinct({ bitrixLeadId: ropCalls.bitrixLeadId })
    .from(ropCalls)
    .where(
      and(
        eq(ropCalls.tenantId, companyId),
        isNotNull(ropCalls.bitrixLeadId),
        or(isNull(ropCalls.crmOutcomeSyncedAt), lt(ropCalls.crmOutcomeSyncedAt, STALE_THRESHOLD))
      )
    )
    .limit(limit)

  for (const row of leadRows) {
    const leadId = row.bitrixLeadId
    if (!leadId) continue
    result.leadsChecked++
    try {
      const lead = await client.crmLeadGet(leadId)
      if (!lead) {
        result.errors++
      } else {
        await db
          .update(ropCalls)
          .set({
            leadStatusId: lead.STATUS_ID ?? null,
            leadOpportunity: lead.OPPORTUNITY ?? null,
            crmOutcomeSyncedAt: new Date(),
          })
          .where(and(eq(ropCalls.tenantId, companyId), eq(ropCalls.bitrixLeadId, leadId)))
      }
    } catch (e) {
      result.errors++
      console.warn(`[ai-rop/crm-outcome-sync] lead ${leadId} (company ${companyId}):`, (e as Error).message)
    }
    await sleep(BITRIX_CALL_DELAY_MS)
  }

  // ── Сделки (небольшой объём, но синкаем тем же проходом) ────────────
  const dealRows = await db
    .selectDistinct({ bitrixDealId: ropCalls.bitrixDealId })
    .from(ropCalls)
    .where(
      and(
        eq(ropCalls.tenantId, companyId),
        isNotNull(ropCalls.bitrixDealId),
        or(isNull(ropCalls.crmOutcomeSyncedAt), lt(ropCalls.crmOutcomeSyncedAt, STALE_THRESHOLD))
      )
    )
    .limit(limit)

  for (const row of dealRows) {
    const dealId = row.bitrixDealId
    if (!dealId) continue
    result.dealsChecked++
    try {
      const deal = await client.crmDealGet(dealId)
      if (!deal) {
        result.errors++
      } else {
        await db
          .update(ropCalls)
          .set({
            dealStageId: deal.STAGE_ID ?? null,
            dealOpportunity: deal.OPPORTUNITY ?? null,
            crmOutcomeSyncedAt: new Date(),
          })
          .where(and(eq(ropCalls.tenantId, companyId), eq(ropCalls.bitrixDealId, dealId)))
      }
    } catch (e) {
      result.errors++
      console.warn(`[ai-rop/crm-outcome-sync] deal ${dealId} (company ${companyId}):`, (e as Error).message)
    }
    await sleep(BITRIX_CALL_DELAY_MS)
  }

  return result
}
