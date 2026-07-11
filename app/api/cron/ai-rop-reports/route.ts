// GET/POST /api/cron/ai-rop-reports
//
// Автоотправка отчётов AI-РОП по расписанию (rop_report_schedules) — раз в
// минуту берёт due-расписания (next_run_at ≤ now, enabled=true) и шлёт каждое
// в Bitrix-мессенджер получателя (личка/групповой чат). Порт call-agent
// scripts/worker.ts::schedulerLoop.
//
// Bitrix-конфиг (webhook/dryRunMessages) собирается per-company из
// rop_settings — расписание без подключённого Bitrix пропускается с ошибкой
// в last_run_error (runScheduled сам пишет её через updateSchedule-подобный UPDATE).
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в минуту):
//   * * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-reports \
//     >> /var/log/ai-rop-reports.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { getDueSchedules, runScheduled } from "@/lib/ai-rop/reports-scheduler"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"

const CRON_NAME = "ai-rop-reports"
const TIME_BUDGET_MS = 50_000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let sent = 0
  let failed = 0
  const errors: string[] = []

  try {
    const due = await getDueSchedules(new Date())

    for (const schedule of due) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break
      try {
        const settingsRow = await getRopSettings(schedule.tenantId)
        const bitrixConfig = toBitrixConfig(settingsRow)
        if (!bitrixConfig) {
          failed++
          errors.push(`${schedule.id}: Bitrix не подключён`)
          continue
        }
        const r = await runScheduled(schedule, bitrixConfig)
        if (r.ok) sent++
        else {
          failed++
          errors.push(`${schedule.id}: ${r.error ?? "неизвестная ошибка"}`)
        }
      } catch (e) {
        failed++
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${schedule.id}: ${msg}`)
        console.error(`[cron/${CRON_NAME}] schedule ${schedule.id}:`, msg)
      }
    }

    const result = { due: due.length, sent, failed, errors, durationMs: Date.now() - t0 }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { sent, failed, errors }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
