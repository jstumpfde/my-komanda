// POST /api/cron/sales-follow-up
// GET  /api/cron/sales-follow-up
//
// Дожим лидов продаж: для каждого активного диалога без брони проверяет
// настройки тенанта и при необходимости отправляет шаблонное сообщение.
//
// Защищён заголовком X-Cron-Secret (значение из env CRON_SECRET).
// Логируется в таблицу cron_runs (startCronRun / finishCronRun).
//
// Рекомендуемое расписание (раз в 15 минут — чтобы не пропустить окно
// firstTouchMinutes при коротких настройках тенанта):
//   */15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/sales-follow-up \
//     >> /var/log/sales-follow-up.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { runSalesFollowUp } from "@/lib/sales/follow-up"

const CRON_NAME = "sales-follow-up"

async function handle(req: NextRequest) {
  // Авторизация по X-Cron-Secret — единый стандарт проекта.
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Логируем запуск в cron_runs (startCronRun может упасть, не роняем роут).
  const run = await startCronRun(CRON_NAME).catch(() => null)

  try {
    const result = await runSalesFollowUp()
    const { checked, sent } = result

    console.log(
      JSON.stringify({
        tag: `cron/${CRON_NAME}`,
        checked,
        sent,
        ts: new Date().toISOString(),
      }),
    )

    if (run) {
      await finishCronRun(run.id, "ok", { checked, sent })
    }

    return NextResponse.json({ ok: true, checked, sent, ts: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)

    if (run) {
      await finishCronRun(run.id, "error", null, message)
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
