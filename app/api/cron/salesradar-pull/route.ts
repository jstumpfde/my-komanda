// GET/POST /api/cron/salesradar-pull
//
// Обходит rop_channel_connectors с mode='pull' AND isEnabled — сейчас это
// только IMAP (Telegram Bot API и WhatsApp-агрегатор — webhook-режим, см.
// /api/salesradar/webhook/[connectorId]). Бюджет ~50с на весь прогон,
// компании/коннекторы обходятся последовательно, остаток подхватит
// следующий тик. Курсор пишется даже при частичном прогоне (connector.pull
// сам режет по budgetMs и возвращает промежуточный курсор).
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в 5 мин):
//   */5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/salesradar-pull \
//     >> /var/log/salesradar-pull.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { getConnector } from "@/lib/salesradar/connectors/registry"
import { decryptConnectorCreds } from "@/lib/salesradar/crypto"
import { ingestMessages, markConnectorSync } from "@/lib/salesradar/ingest"
import type { ConnectorKind, ConnectorPullContext } from "@/lib/salesradar/types"

const CRON_NAME = "salesradar-pull"
const TIME_BUDGET_MS = 50_000
const PER_CONNECTOR_BUDGET_MS = 15_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let connectorsProcessed = 0
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  try {
    const rows = await db
      .select()
      .from(ropChannelConnectors)
      .where(and(eq(ropChannelConnectors.mode, "pull"), eq(ropChannelConnectors.isEnabled, true)))

    for (const row of rows) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break

      const connector = getConnector(row.kind as ConnectorKind)
      if (!connector || !connector.capabilities.pull || !connector.pull) {
        errors.push(`${row.id}: коннектор kind=${row.kind} не поддерживает pull`)
        continue
      }

      connectorsProcessed++
      try {
        const creds = row.credentialsEnc ? decryptConnectorCreds(row.credentialsEnc) : {}
        const ctx: ConnectorPullContext & { config?: unknown; creds?: unknown } = {
          companyId: row.companyId,
          connectorId: row.id,
          cursor: row.cursorJson ?? null,
          budgetMs: Math.min(PER_CONNECTOR_BUDGET_MS, Math.max(1000, TIME_BUDGET_MS - (Date.now() - t0))),
          config: row.config ?? {},
          creds,
        }
        const pullResult = await connector.pull(ctx)
        const normalized = pullResult.messages.map((raw) => connector.normalize(raw, { id: row.id, companyId: row.companyId, kind: row.kind as ConnectorKind }))
        const ingestResult = await ingestMessages(row.companyId, row.id, normalized)
        inserted += ingestResult.inserted
        skipped += ingestResult.skipped
        errors.push(...ingestResult.errors.map((e) => `${row.id}: ${e}`))

        await markConnectorSync(row.id, { cursor: pullResult.cursor, status: "active", error: ingestResult.errors[0] ?? null })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        errors.push(`${row.id}: ${message}`)
        await markConnectorSync(row.id, { status: "error", error: message }).catch(() => {})
      }
    }

    const result = { connectorsProcessed, inserted, skipped, errors, durationMs: Date.now() - t0 }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { connectorsProcessed, inserted, skipped, errors }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
