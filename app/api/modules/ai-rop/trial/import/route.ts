// POST /api/modules/ai-rop/trial/import — шаг 2 мастера подключения:
// «Мы читаем историю за последние дни». Синхронный первичный импорт для
// pull-коннекторов компании (IMAP) — несколько итераций pull() подряд в
// рамках бюджета, чтобы за один клик подтянуть больше истории, чем один
// тик крона (см. app/api/cron/salesradar-pull, тот же ingestMessages/
// markConnectorSync, но без общего лимита кроном и без обхода чужих компаний).
// Webhook-коннекторы (telegram_bot/whatsapp_agg) ничего не «подтягивают» —
// они уже начали получать сообщения по вебхуку сразу после подключения,
// этот роут просто их не трогает.
//
// Гейт — requireRopManage (владелец мастера подключения).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getConnector } from "@/lib/salesradar/connectors/registry"
import { decryptConnectorCreds } from "@/lib/salesradar/crypto"
import { ingestMessages, markConnectorSync } from "@/lib/salesradar/ingest"
import type { ConnectorKind, ConnectorPullContext } from "@/lib/salesradar/types"

const TIME_BUDGET_MS = 25_000 // укладываемся в разумный таймаут запроса из UI мастера
const PER_CALL_BUDGET_MS = 8_000
const MAX_ITERATIONS_PER_CONNECTOR = 6 // ~6×50 писем IMAP-коннектора за один запуск шага 2

export async function POST() {
  try {
    const user = await requireRopManage()
    const t0 = Date.now()

    const rows = await db
      .select()
      .from(ropChannelConnectors)
      .where(and(eq(ropChannelConnectors.companyId, user.companyId), eq(ropChannelConnectors.mode, "pull"), eq(ropChannelConnectors.isEnabled, true)))

    let connectorsProcessed = 0
    let inserted = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break
      const connector = getConnector(row.kind as ConnectorKind)
      if (!connector || !connector.capabilities.pull || !connector.pull) continue

      connectorsProcessed++
      let cursor: unknown = row.cursorJson ?? null
      try {
        const creds = row.credentialsEnc ? decryptConnectorCreds(row.credentialsEnc) : {}
        for (let i = 0; i < MAX_ITERATIONS_PER_CONNECTOR; i++) {
          if (Date.now() - t0 > TIME_BUDGET_MS) break
          const ctx: ConnectorPullContext & { config?: unknown; creds?: unknown } = {
            companyId: row.companyId,
            connectorId: row.id,
            cursor,
            budgetMs: Math.min(PER_CALL_BUDGET_MS, Math.max(1000, TIME_BUDGET_MS - (Date.now() - t0))),
            config: row.config ?? {},
            creds,
          }
          const pullResult = await connector.pull(ctx)
          cursor = pullResult.cursor
          const normalized = pullResult.messages.map((raw) => connector.normalize(raw, { id: row.id, companyId: row.companyId, kind: row.kind as ConnectorKind }))
          const ingestResult = await ingestMessages(row.companyId, row.id, normalized)
          inserted += ingestResult.inserted
          skipped += ingestResult.skipped
          errors.push(...ingestResult.errors.map((e) => `${row.id}: ${e}`))
          await markConnectorSync(row.id, { cursor, status: "active", error: ingestResult.errors[0] ?? null })

          // Меньше MAX_MESSAGES_PER_PULL сообщений за итерацию = дошли до конца истории/лимита сервера.
          if (pullResult.messages.length === 0) break
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        errors.push(`${row.id}: ${message}`)
        await markConnectorSync(row.id, { status: "error", error: message }).catch(() => {})
      }
    }

    return NextResponse.json({
      ok: true,
      connectorsProcessed,
      inserted,
      skipped,
      errors,
      durationMs: Date.now() - t0,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/trial/import] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
