// GET/POST /api/cron/tip-reaper
// Защищён X-Cron-Secret. Подчищает зависшие прогоны модуля «Типология»
// (status pending/generating старше STALE_RUN_MINUTES (см. lib/tip/service.ts) — обычно причина: рестарт PM2
// прервал detached-генерацию в lib/tip/service.ts::runGeneration). Такие
// прогоны без этого репера навсегда блокируют юзера гвардом «один активный
// прогон» и висят на балансе.
//
// Дублирует ленивые вызовы reapStaleRuns() из createRun/getRunForUser —
// нужен на случай, если пользователь просто не вернулся в бота/на сайт.
//
// Crontab на сервере (раз в 15 минут):
//   */15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/tip-reaper >> /var/log/tip-reaper.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { reapStaleRuns } from "@/lib/tip/service"

const CRON_NAME = "tip-reaper"

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const { reaped } = await reapStaleRuns()
    if (run) await finishCronRun(run.id, "ok", { reaped }).catch(() => {})
    return NextResponse.json({ ok: true, reaped })
  } catch (e) {
    if (run) await finishCronRun(run.id, "error", null, String(e)).catch(() => {})
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
