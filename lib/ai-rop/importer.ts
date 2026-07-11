/**
 * Импорт звонков из Bitrix в rop_calls — порт call-agent lib/importer.ts.
 * Используется и вручную (API-роут импорта, фаза 3), и авто-импортёром
 * (auto-importer.ts / cron ai-rop-import).
 */
import { db } from "@/lib/db"
import { ropCalls, type NewRopCall } from "@/lib/db/schema"
import { entityTypeStringToId, type BitrixClient } from "./bitrix"
import { backfillManagerNames } from "./managers"

const MAX_PAGES = 20 // 20 страниц × 50 = до 1000 звонков за запуск

export interface ImportResult {
  ok: true
  totalFetched: number
  inserted: number
  skipped: number
  pages: number
  durationMs: number
  managers: { uniqueIds: number; fetched: number; updatedCalls: number } | null
  note: string | null
}

export interface ImportError {
  ok: false
  error: string
  partial?: { totalFetched: number; inserted: number; skipped: number; pages: number }
}

export interface ImportOpts {
  fromDate: string // YYYY-MM-DD
  toDate?: string // YYYY-MM-DD
  managerIds?: string[]
  maxPages?: number
  /**
   * Если true — импортируем все звонки, включая «служебные» (без recording_url
   * и без CRM_ACTIVITY_ID — обычно внутренние между сотрудниками, IVR и т.п.).
   * Такие звонки сразу получают статус 'no_recording' — пайплайн их не трогает.
   */
  includeServiceCalls?: boolean
}

export async function importCallsFromBitrix(
  client: BitrixClient,
  companyId: string,
  opts: ImportOpts
): Promise<ImportResult | ImportError> {
  const t0 = Date.now()
  let start = 0
  let totalFetched = 0
  let inserted = 0
  let skipped = 0
  let pages = 0
  const maxPages = opts.maxPages ?? MAX_PAGES

  try {
    while (pages < maxPages) {
      pages += 1
      const page = await client.voxListStatistics({
        fromDate: opts.fromDate,
        toDate: opts.toDate,
        managerIds: opts.managerIds,
        // Не фильтруем по CALL_DURATION>0 — иначе пропускаем «не дозвонились»
        // (incoming calls с duration=0), а они важны для статистики менеджеров.
        hasRecordOnly: false,
        start,
      })

      for (const stat of page.items) {
        totalFetched += 1
        const recordingUrl = stat.CALL_RECORD_URL || stat.CALL_WEBDAV_URL || null
        const hasActivity = stat.CRM_ACTIVITY_ID && stat.CRM_ACTIVITY_ID !== "0"
        const isServiceCall = !recordingUrl && !hasActivity

        if (isServiceCall && !opts.includeServiceCalls) {
          skipped += 1
          continue
        }

        const initialStatus = isServiceCall ? "no_recording" : "pending"
        const initialAttempts = isServiceCall ? 99 : 0 // 99 = не повторять

        const entityType = entityTypeStringToId(stat.CRM_ENTITY_TYPE)
        const values: NewRopCall = {
          tenantId: companyId,
          bitrixCallId: stat.ID,
          bitrixDealId: entityType === 2 ? stat.CRM_ENTITY_ID ?? null : null,
          bitrixLeadId: entityType === 1 ? stat.CRM_ENTITY_ID ?? null : null,
          bitrixContactId: entityType === 3 ? stat.CRM_ENTITY_ID ?? null : null,
          bitrixActivityId: stat.CRM_ACTIVITY_ID ?? null,
          managerId: stat.PORTAL_USER_ID ?? null,
          clientPhone: stat.PHONE_NUMBER ?? null,
          // CALL_TYPE по docs Bitrix: "1"=исходящий, "2"=входящий, "3"=входящий с переадресацией, "4"=callback
          direction: stat.CALL_TYPE === "2" || stat.CALL_TYPE === "3" ? "in" : "out",
          startedAt: stat.CALL_START_DATE ? new Date(stat.CALL_START_DATE) : null,
          durationSec: Number(stat.CALL_DURATION || 0),
          recordingUrl,
          status: initialStatus,
          attempts: initialAttempts,
        }

        const [created] = await db
          .insert(ropCalls)
          .values(values)
          .onConflictDoNothing({ target: [ropCalls.tenantId, ropCalls.bitrixCallId] })
          .returning({ id: ropCalls.id })
        if (created) inserted += 1
        else skipped += 1
      }

      if (page.next == null) break
      start = page.next
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, partial: { totalFetched, inserted, skipped, pages } }
  }

  let managers: { uniqueIds: number; fetched: number; updatedCalls: number } | null = null
  try {
    managers = await backfillManagerNames(client, companyId)
  } catch (e) {
    console.warn("[ai-rop/importer] backfillManagerNames failed:", (e as Error).message)
  }

  return {
    ok: true,
    totalFetched,
    inserted,
    skipped,
    pages,
    durationMs: Date.now() - t0,
    managers,
    note: pages >= maxPages ? `Достигнут лимит ${maxPages * 50} звонков за запуск.` : null,
  }
}
