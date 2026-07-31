// GET/POST /api/cron/salesradar-attribute
//
// Раздел B плана SalesRadar — регулярный прогон каскада привязки сообщений
// (attribution.ts) + свёртки привязанных сообщений в эпизоды (rollup.ts).
// Компании выбираются по факту наличия pending-сообщений в rop_messages
// (не по rop_channel_connectors — коннекторы ingest'ят независимо, крону
// достаточно знать "у кого есть что разобрать").
//
// Тайм-бюджет ~50с на прогон, поделен между attribution (35с) и rollup (15с)
// на компанию; при нехватке времени остаток подхватит следующий тик (*/2).
// Защищён X-Cron-Secret. Рекомендуемое расписание:
//   */2 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/salesradar-attribute \
//     >> /var/log/salesradar-attribute.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropMessages } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { attributeCompanyMessages } from "@/lib/salesradar/attribution"
import { rollupCompanyMessages } from "@/lib/salesradar/rollup"

const CRON_NAME = "salesradar-attribute"
const TIME_BUDGET_MS = 50_000
const PER_COMPANY_ATTRIBUTION_BUDGET_MS = 35_000
const PER_COMPANY_ROLLUP_BUDGET_MS = 15_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let companies = 0
  let processed = 0
  let linked = 0
  let newDeals = 0
  let pending = 0
  let smallTalk = 0
  let episodesCreated = 0
  let messagesRolled = 0
  let tokensSpent = 0
  const errors: string[] = []

  try {
    const companyRows = await db
      .selectDistinct({ companyId: ropMessages.companyId })
      .from(ropMessages)
      .where(sql`${ropMessages.attributionStatus} = 'pending'`)

    for (const row of companyRows) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break
      companies++
      try {
        const attrBudget = Math.min(PER_COMPANY_ATTRIBUTION_BUDGET_MS, Math.max(0, TIME_BUDGET_MS - (Date.now() - t0)))
        const attrResult = await attributeCompanyMessages(row.companyId, { budgetMs: attrBudget })
        processed += attrResult.processed
        linked += attrResult.linked
        newDeals += attrResult.newDeals
        pending += attrResult.pending
        smallTalk += attrResult.smallTalk
        tokensSpent += attrResult.tokensSpent

        const rollupBudget = Math.min(PER_COMPANY_ROLLUP_BUDGET_MS, Math.max(0, TIME_BUDGET_MS - (Date.now() - t0)))
        if (rollupBudget > 0) {
          const rollupResult = await rollupCompanyMessages(row.companyId, { budgetMs: rollupBudget })
          episodesCreated += rollupResult.episodesCreated
          messagesRolled += rollupResult.messagesRolled
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${row.companyId}: ${msg}`)
        console.error(`[cron/${CRON_NAME}] company ${row.companyId}:`, msg)
      }
    }

    const result = {
      companies, processed, linked, newDeals, pending, smallTalk,
      episodesCreated, messagesRolled, tokensSpent, errors,
      durationMs: Date.now() - t0,
    }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { companies, processed, linked, errors }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
