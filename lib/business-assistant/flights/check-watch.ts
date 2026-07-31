// Логика проверки ОДНОГО flight_price_watches — общая для крона
// /api/cron/flight-price-watch (обходит все active) и ручной кнопки
// «Проверить сейчас» на странице /business-assistant/flights/watches
// (проверяет один, по требованию пользователя). Не дублировать между ними.
import { db } from "@/lib/db"
import { notifications, userTelegramLinks, type FlightPriceWatch } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { runFlightSearch, cheapestOffer } from "./run-search"
import { shouldNotifyPriceDrop, buildPriceDropNotification, buildTelegramMessage } from "./watch-notify"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { flightPriceWatches } from "@/lib/db/schema"
import type { FlightFilters, FlightSearchParams, TripClass } from "./types"

const NOTIFY_DEDUP_MS = 6 * 60 * 60_000 // не дублировать одно и то же событие чаще, чем раз в 6ч

export interface CheckWatchResult {
  newPriceRub:   number | null
  notified:      boolean
  telegramSent:  boolean | null // null = уведомление не отправлялось (не было повода или TG выключен)
}

export async function checkSingleWatch(watch: FlightPriceWatch): Promise<CheckWatchResult> {
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
  const bestOffer = cheapestOffer(result)
  if (bestOffer === null) return { newPriceRub: null, notified: false, telegramSent: null }

  const newPrice = bestOffer.priceRub
  const notify = shouldNotifyPriceDrop({ targetPriceRub: watch.targetPriceRub, lastPriceRub: watch.lastPriceRub }, newPrice)

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

  if (!notify) return { newPriceRub: newPrice, notified: false, telegramSent: null }

  // Дедуп — то же событие не шлём чаще, чем раз в NOTIFY_DEDUP_MS.
  const [existing] = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.type, "flight_price_drop"), eq(notifications.sourceId, watch.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(1)
  const isRecent = existing?.createdAt && Date.now() - new Date(existing.createdAt).getTime() < NOTIFY_DEDUP_MS
  if (isRecent) return { newPriceRub: newPrice, notified: false, telegramSent: null }

  const { title, body } = buildPriceDropNotification(
    { originIata: watch.originIata, destinationIata: watch.destinationIata, targetPriceRub: watch.targetPriceRub, lastPriceRub: watch.lastPriceRub },
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

  let telegramSent: boolean | null = null
  if (watch.notifyTelegram) {
    // telegramChatId — ручной override; без него берём chatId из привязки
    // пользователя к боту @TiketCompany24bot (user_telegram_links).
    const chatId = watch.telegramChatId ?? (await resolveLinkedChatId(watch.userId))
    if (chatId) {
      const text = buildTelegramMessage(
        { originIata: watch.originIata, destinationIata: watch.destinationIata, targetPriceRub: watch.targetPriceRub, lastPriceRub: watch.lastPriceRub },
        newPrice,
        { departDate: bestOffer.departDate, airlineLabel: bestOffer.airlineLabel, baggage: bestOffer.baggage, deepLink: bestOffer.deepLink },
      )
      telegramSent = await sendTelegramAlert(chatId, text)
    }
  }

  return { newPriceRub: newPrice, notified: true, telegramSent }
}

async function resolveLinkedChatId(userId: string): Promise<string | null> {
  const [link] = await db
    .select({ chatId: userTelegramLinks.chatId })
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.userId, userId))
    .limit(1)
  return link?.chatId ?? null
}
