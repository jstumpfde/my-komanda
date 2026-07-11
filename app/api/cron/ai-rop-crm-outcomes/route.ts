// GET/POST /api/cron/ai-rop-crm-outcomes
//
// Синк финального статуса лида/сделки Bitrix для звонков AI-РОП (STATUS_ID/
// STAGE_ID + сумма) — по всем компаниям с настроенным rop_settings.bitrixWebhookUrl.
// lib/ai-rop/crm-outcome-sync.ts сама берёт только «протухшие» (не синканные >24ч)
// записи и щадит rate-limit Bitrix (180мс между вызовами).
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в 6 часов):
//   0 */6 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-crm-outcomes \
//     >> /var/log/ai-rop-crm-outcomes.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { and, isNotNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSettings } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { syncCrmOutcomes } from "@/lib/ai-rop/crm-outcome-sync"

export const maxDuration = 300

const CRON_NAME = "ai-rop-crm-outcomes"
const TIME_BUDGET_MS = 280_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let companies = 0
  let leadsChecked = 0
  let dealsChecked = 0
  let errorsCount = 0

  try {
    const rows = await db
      .select()
      .from(ropSettings)
      .where(and(isNotNull(ropSettings.bitrixWebhookUrl), ne(ropSettings.bitrixWebhookUrl, "")))

    for (const row of rows) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break
      const bitrixConfig = toBitrixConfig(row)
      if (!bitrixConfig) continue
      companies++
      try {
        const client = createBitrixClient(bitrixConfig)
        const r = await syncCrmOutcomes(client, row.companyId)
        leadsChecked += r.leadsChecked
        dealsChecked += r.dealsChecked
        errorsCount += r.errors
      } catch (e) {
        errorsCount++
        console.error(`[cron/${CRON_NAME}] company ${row.companyId}:`, (e as Error).message)
      }
    }

    const result = { companies, leadsChecked, dealsChecked, errors: errorsCount, durationMs: Date.now() - t0 }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { companies, leadsChecked, dealsChecked, errors: errorsCount }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
