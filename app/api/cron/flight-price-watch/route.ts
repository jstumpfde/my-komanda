// Крон «Отслеживать цену» (Бизнес-ассистент → Авиабилеты): для каждого
// активного flight_price_watches вызывает checkSingleWatch (общая логика с
// кнопкой «Проверить сейчас» на странице /business-assistant/flights/watches
// — не дублируется). Уведомление в колокольчик + опционально в Telegram при
// достижении целевой цены или падении >=15% от последней проверки.
//
// Расписание на сервере (раз в 6 часов):
//   0 4,10,16,22 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/flight-price-watch >> /var/log/flight-price-watch.log 2>&1
//
// Cooldown 6 часов между запусками крона — защита от дублей при ручных
// перезапусках (отдельно от 6ч дедупа одного и того же уведомления внутри
// checkSingleWatch).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { cronRuns, flightPriceWatches } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { checkSingleWatch } from "@/lib/business-assistant/flights/check-watch"

const CRON_NAME = "flight-price-watch"
const MIN_INTERVAL_MS = 6 * 60 * 60_000

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: cronRuns.startedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.startedAt ?? null
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, skipped: true, reason: "too_recent" })
  }

  const watches = await db.select().from(flightPriceWatches).where(eq(flightPriceWatches.active, true))
  if (watches.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_active_watches" })
  }

  const run = await startCronRun(CRON_NAME)
  let checked = 0
  let notified = 0
  let telegramSent = 0
  let errors = 0

  try {
    for (const watch of watches) {
      try {
        const result = await checkSingleWatch(watch)
        checked++
        if (result.notified) notified++
        if (result.telegramSent) telegramSent++
      } catch (err) {
        console.error(`[${CRON_NAME}] watch ${watch.id}:`, err)
        errors++
      }
    }

    await finishCronRun(run.id, "ok", { watchesTotal: watches.length, checked, notified, telegramSent, errors })
    return NextResponse.json({ ok: true, watchesTotal: watches.length, checked, notified, telegramSent, errors })
  } catch (err) {
    await finishCronRun(run.id, "error", null, String(err))
    throw err
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
