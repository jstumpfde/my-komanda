// GET/POST /api/cron/ai-rop-import
//
// Инкрементальный автоимпорт звонков AI-РОП из Bitrix — по всем компаниям с
// настроенным rop_settings.bitrixWebhookUrl. runAutoImport() сам проверяет
// settings.autoImportEnabled (пропускает выключенные) и внутри же тянет
// email/чаты (fetchEmailAndChats) раз в ~10 минут по метке
// activitiesLastFetchedAt — отдельного цикла для этого не нужно (см.
// lib/ai-rop/auto-importer.ts).
//
// Тайм-бюджет ~50с на прогон — компании обходятся последовательно, при
// нехватке времени остаток подхватит следующий тик (*/5).
//
// Защищён X-Cron-Secret. Рекомендуемое расписание:
//   */5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-import \
//     >> /var/log/ai-rop-import.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { and, isNotNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSettings } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { runAutoImport } from "@/lib/ai-rop/auto-importer"

const CRON_NAME = "ai-rop-import"
const TIME_BUDGET_MS = 50_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let companies = 0
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

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
        const result = await runAutoImport(client, row.companyId)
        if (result.calls.ok && "inserted" in result.calls) {
          inserted += result.calls.inserted
          skipped += result.calls.skipped
        } else if (!result.calls.ok && result.calls.error !== "disabled") {
          errors.push(`${row.companyId}: ${result.calls.error}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${row.companyId}: ${msg}`)
        console.error(`[cron/${CRON_NAME}] company ${row.companyId}:`, msg)
      }
    }

    const result = { companies, inserted, skipped, errors, durationMs: Date.now() - t0 }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { companies, inserted, skipped, errors }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
