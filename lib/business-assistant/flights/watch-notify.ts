// Логика решения «уведомлять ли о падении цены» для крона
// /api/cron/flight-price-watch — вынесена в чистые функции, чтобы
// тестировать без БД/сети.
import { formatBaggageLabel } from "./baggage"
import type { BaggageAllowance } from "./types"

const PRICE_DROP_THRESHOLD = 0.15 // -15% от последней проверенной цены

export interface WatchPriceState {
  targetPriceRub: number | null
  lastPriceRub:   number | null
}

/** true, если новую цену стоит превратить в уведомление: она достигла
 *  целевой цены ИЛИ упала минимум на 15% от последней известной. */
export function shouldNotifyPriceDrop(watch: WatchPriceState, newPriceRub: number): boolean {
  if (watch.targetPriceRub != null && newPriceRub <= watch.targetPriceRub) return true
  if (watch.lastPriceRub != null && watch.lastPriceRub > 0) {
    const drop = (watch.lastPriceRub - newPriceRub) / watch.lastPriceRub
    if (drop >= PRICE_DROP_THRESHOLD) return true
  }
  return false
}

export function formatRouteLabel(originIata: string, destinationIata: string): string {
  return `${originIata} → ${destinationIata}`
}

/** Текст уведомления на русском — с маршрутом и ценой, честно указывает
 *  причину (целевая цена достигнута / цена упала). */
export function buildPriceDropNotification(
  watch: WatchPriceState & { originIata: string; destinationIata: string },
  newPriceRub: number,
): { title: string; body: string } {
  const route = formatRouteLabel(watch.originIata, watch.destinationIata)
  const reachedTarget = watch.targetPriceRub != null && newPriceRub <= watch.targetPriceRub

  if (reachedTarget) {
    return {
      title: `Цена ниже целевой: ${route}`,
      body: `${route} — ${newPriceRub.toLocaleString("ru-RU")} ₽ (целевая цена ${watch.targetPriceRub!.toLocaleString("ru-RU")} ₽ достигнута).`,
    }
  }

  const dropPct = watch.lastPriceRub ? Math.round(((watch.lastPriceRub - newPriceRub) / watch.lastPriceRub) * 100) : 0
  return {
    title: `Цена упала: ${route}`,
    body: `${route} — ${newPriceRub.toLocaleString("ru-RU")} ₽ (было ${watch.lastPriceRub?.toLocaleString("ru-RU")} ₽, −${dropPct}%).`,
  }
}

export interface TelegramOfferDetails {
  departDate:      string
  airlineLabel:    string
  baggage:         BaggageAllowance
  deepLink:        string
}

/** HTML-текст для sendTelegramAlert (parse_mode=HTML уже включён в хелпере) —
 *  жирный заголовок, маршрут+дата, рейс, багаж, цена, ссылка "Купить на
 *  Aviasales". Тот же повод, что и колокольчик (целевая цена / падение). */
export function buildTelegramMessage(
  watch: WatchPriceState & { originIata: string; destinationIata: string },
  newPriceRub: number,
  offer?: TelegramOfferDetails,
): string {
  const { title } = buildPriceDropNotification(watch, newPriceRub)
  const route = formatRouteLabel(watch.originIata, watch.destinationIata)

  const lines = [`✈️ <b>${title}</b>`, ""]
  lines.push(offer ? `${route}, ${offer.departDate}` : route)
  if (offer) lines.push(offer.airlineLabel)
  lines.push(`Цена: <b>${newPriceRub.toLocaleString("ru-RU")} ₽</b>`)
  if (offer) lines.push(formatBaggageLabel(offer.baggage))
  if (offer?.deepLink) lines.push("", `<a href="${offer.deepLink}">Купить на Aviasales</a>`)

  return lines.join("\n")
}

// Telegram chat_id — число (может быть отрицательным для групп/каналов).
// Личный chat пользователь получает, написав /start боту компании.
const TELEGRAM_CHAT_ID_RE = /^-?\d+$/

export function isValidTelegramChatId(raw: string): boolean {
  return TELEGRAM_CHAT_ID_RE.test(raw.trim())
}
