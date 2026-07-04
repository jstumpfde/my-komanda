// GET/POST /api/cron/telegram-posting-tick
// Обрабатывает очередь отложенных Telegram-постов владельца платформы:
// выбирает due-посты (status='scheduled', scheduled_at<=now), рассылает по
// выбранным чатам с паузами 30-90 сек между отправками (бюджет тика — 4 мин
// суммарных пауз, остальное — в следующий тик), логирует в
// telegram_post_deliveries, планирует repeat (daily/weekly).
//
// Защита: X-Cron-Secret. Запись в cron_runs через startCronRun/finishCronRun.
//
// Crontab на сервере (рекомендуется раз в 5 минут):
//   */5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/telegram-posting-tick \
//     >> /var/log/telegram-posting-tick.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { processDuePosts } from "@/lib/telegram-posting/sender"

export const maxDuration = 300

const CRON_NAME = "telegram-posting-tick"

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const result = await processDuePosts()
    if (run) await finishCronRun(run.id, "ok", { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[telegram-posting-tick] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
