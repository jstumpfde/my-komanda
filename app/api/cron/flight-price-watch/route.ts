// Крон «Отслеживать цену» (Бизнес-ассистент → Авиабилеты): для каждого
// активного flight_price_watches прогоняет тот же поиск, что и ручной поиск
// (runFlightSearch — переиспользуется, не дублируется), обновляет
// last/best price и создаёт уведомление при достижении целевой цены или
// падении >=15% от последней проверки.
//
// Расписание на сервере (раз в 6 часов):
//   0 4,10,16,22 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/flight-price-watch >> /var/log/flight-price-watch.log 2>&1
//
// Cooldown 6 часов — защита от дублей при ручных перезапусках.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { cronRuns, flightPriceWatches, notifications } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { runFlightSearch, cheapestPrice } from "@/lib/business-assistant/flights/run-search"
import { shouldNotifyPriceDrop, buildPriceDropNotification } from "@/lib/business-assistant/flights/watch-notify"
import type { FlightFilters, FlightSearchParams, TripClass } from "@/lib/business-assistant/flights/types"

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
  let errors = 0

  try {
    for (const watch of watches) {
      try {
        const params: FlightSearchParams = {
          originIata:      watch.originIata,
          destinationIata: watch.destinationIata,
          departDate:      watch.departDate,
          departDateTo:    watch.departDateTo ?? undefined,
          adults:          1,
          tripClass:       (watch.tripClass as TripClass) ?? "economy",
        }
        const filters = (watch.filtersJson as FlightFilters | null) ?? undefined
        const result = await runFlightSearch(params, filters)
        const newPrice = cheapestPrice(result)
        checked++
        if (newPrice === null) continue // ничего не нашли в этот раз — не считаем ошибкой

        const notify = shouldNotifyPriceDrop(
          { targetPriceRub: watch.targetPriceRub, lastPriceRub: watch.lastPriceRub },
          newPrice,
        )

        const now = new Date()
        const isNewBest = watch.bestPriceRub == null || newPrice < watch.bestPriceRub
        await db
          .update(flightPriceWatches)
          .set({
            lastPriceRub:  newPrice,
            lastCheckedAt: now,
            bestPriceRub:  isNewBest ? newPrice : watch.bestPriceRub,
            bestPriceAt:   isNewBest ? now : watch.bestPriceAt,
          })
          .where(eq(flightPriceWatches.id, watch.id))

        if (notify) {
          // Не дублируем — если за последние 6ч уже было уведомление по этому watch, пропускаем.
          const [existing] = await db
            .select({ createdAt: notifications.createdAt })
            .from(notifications)
            .where(
              and(
                eq(notifications.type, "flight_price_drop"),
                eq(notifications.sourceId, watch.id),
              ),
            )
            .orderBy(desc(notifications.createdAt))
            .limit(1)

          const isRecent = existing?.createdAt && Date.now() - new Date(existing.createdAt).getTime() < MIN_INTERVAL_MS

          if (!isRecent) {
            const { title, body } = buildPriceDropNotification(
              { ...watch, targetPriceRub: watch.targetPriceRub, lastPriceRub: watch.lastPriceRub },
              newPrice,
            )
            await db.insert(notifications).values({
              tenantId:   watch.companyId,
              userId:     watch.userId,
              type:       "flight_price_drop",
              title,
              body,
              severity:   "success",
              sourceType: "flight_price_watch",
              sourceId:   watch.id,
              href:       "/business-assistant/flights",
            })
            notified++
          }
        }
      } catch (err) {
        console.error(`[${CRON_NAME}] watch ${watch.id}:`, err)
        errors++
      }
    }

    await finishCronRun(run.id, "ok", { watchesTotal: watches.length, checked, notified, errors })
    return NextResponse.json({ ok: true, watchesTotal: watches.length, checked, notified, errors })
  } catch (err) {
    await finishCronRun(run.id, "error", null, String(err))
    throw err
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
