import { db } from "@/lib/db"
import { flightDeals } from "@/lib/db/schema"
import { fetchAllTelegramDeals } from "./telegram-deals"

const TTL_MS = 30 * 60 * 1000 // 30 минут

// Метка последнего полного перечитывания каналов — процесс-локальная (не в
// БД): flight_deals дедуплицируется по source_message_url через
// onConflictDoNothing, поэтому "свежесть по max(created_at)" ломается, если
// за TTL в каналах не появилось ни одного НОВОГО поста — тогда max(created_at)
// не двигается, и без этой метки мы бы стучались в t.me на каждый запрос.
let lastRefreshAt = 0

/** Если с последнего перечитывания каналов прошло больше TTL (или force) —
 *  опрашивает Telegram-каналы и записывает новые находки (по уникальному
 *  source_message_url — повторные посты не дублируются). Иначе не трогает
 *  сеть и отдаёт текущий кэш в БД как есть. */
export async function refreshFlightDealsIfStale(force = false): Promise<{ refreshed: boolean; inserted: number }> {
  const isFresh = !force && Date.now() - lastRefreshAt < TTL_MS
  if (isFresh) return { refreshed: false, inserted: 0 }

  lastRefreshAt = Date.now()
  const parsed = await fetchAllTelegramDeals()
  if (parsed.length === 0) return { refreshed: true, inserted: 0 }

  const rows = parsed.map((d) => ({
    routeFrom: d.routeFrom,
    routeTo: d.routeTo,
    priceRub: d.priceRub,
    sourceChannel: d.channel,
    sourceMessageUrl: d.postUrl,
    rawText: d.rawText,
  }))

  await db.insert(flightDeals).values(rows).onConflictDoNothing({ target: flightDeals.sourceMessageUrl })
  return { refreshed: true, inserted: rows.length }
}
