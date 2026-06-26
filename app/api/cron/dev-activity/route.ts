// Сбор активности подрядчика: SSH → git → Claude → dev_activity_days.
// Защита — X-Cron-Secret. Логируется в cron_runs.
//
// Запускаем раз в 15 минут — чтобы в течение дня видеть, что человек катит
// (лента «что катит сейчас» + обновляющийся вердикт сегодня). Дёшево: Claude
// дёргается только когда у сегодняшнего дня реально появился новый коммит
// (разбор переиспользуется по отпечатку SHA), остальное — лёгкий git по SSH.
//
// Расписание на сервере (каждые 15 минут):
//   */15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/dev-activity >> /var/log/dev-activity.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { collectAndStore } from "@/lib/dev-activity/store"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const CRON_NAME = "dev-activity"

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const result = await collectAndStore()
    if (run) await finishCronRun(run.id, "ok", { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest)  { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
