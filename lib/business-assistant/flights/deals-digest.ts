// Бизнес-ассистент → Авиабилеты → «Дайджест выбросов цен».
//
// Отбор топа находок для ежедневного Telegram-дайджеста
// (крон /api/cron/flight-deals-digest) — вынесен в чистые функции, чтобы
// тестировать без БД/сети. Источник находок — та же таблица flight_deals,
// что наполняет lib/business-assistant/flights/deals-cache.ts.
import type { FlightDeal } from "@/lib/db/schema"

export const DIGEST_WINDOW_MS = 24 * 60 * 60_000 // сутки
export const DIGEST_MIN_PRICE_RUB = 1500 // отсев мусора парсинга (слишком дёшево = не билет)
export const DIGEST_MAX_PER_CHANNEL = 2 // разнообразие источников
export const DIGEST_MAX_TOTAL = 8
export const DIGEST_MIN_FINDINGS = 3 // меньше — не спамим пустым дайджестом

export interface DigestSelectionResult {
  /** Отобранные находки — отсортированы по цене (дешевле выше), не больше
   *  DIGEST_MAX_TOTAL, не больше DIGEST_MAX_PER_CHANNEL на канал. */
  deals:    FlightDeal[]
  /** Сколько находок прошло базовые фильтры (окно+цена+маршрут) ДО среза по
   *  топу/каналу — именно это число сравнивается с DIGEST_MIN_FINDINGS. */
  eligibleCount: number
  /** false — дайджест слать не нужно (eligibleCount < DIGEST_MIN_FINDINGS). */
  shouldSend: boolean
}

function hasRecognizedRoute(deal: Pick<FlightDeal, "routeFrom" | "routeTo">): boolean {
  const from = deal.routeFrom?.trim()
  const to = deal.routeTo?.trim()
  return !!from && !!to && from !== "?" && to !== "?"
}

/** Отбирает топ находок для дайджеста из полного списка flight_deals.
 *  Фильтры: за последние 24 часа (относительно `now`), маршрут распознан,
 *  цена >= DIGEST_MIN_PRICE_RUB. Затем сортировка по цене (дешевле — выше),
 *  не более DIGEST_MAX_PER_CHANNEL на канал, не более DIGEST_MAX_TOTAL всего.
 *  Если находок за сутки (после фильтров, ДО среза по каналу/топу) меньше
 *  DIGEST_MIN_FINDINGS — shouldSend=false и deals пуст. */
export function selectDigestDeals(deals: FlightDeal[], now: Date = new Date()): DigestSelectionResult {
  const windowStart = now.getTime() - DIGEST_WINDOW_MS

  const eligible = deals.filter((d) => {
    const createdAt = d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt)
    if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() < windowStart || createdAt.getTime() > now.getTime()) return false
    if (!hasRecognizedRoute(d)) return false
    if (d.priceRub < DIGEST_MIN_PRICE_RUB) return false
    return true
  })

  if (eligible.length < DIGEST_MIN_FINDINGS) {
    return { deals: [], eligibleCount: eligible.length, shouldSend: false }
  }

  const sorted = [...eligible].sort((a, b) => a.priceRub - b.priceRub)

  const perChannelCount = new Map<string, number>()
  const picked: FlightDeal[] = []
  for (const deal of sorted) {
    if (picked.length >= DIGEST_MAX_TOTAL) break
    const count = perChannelCount.get(deal.sourceChannel) ?? 0
    if (count >= DIGEST_MAX_PER_CHANNEL) continue
    picked.push(deal)
    perChannelCount.set(deal.sourceChannel, count + 1)
  }

  return { deals: picked, eligibleCount: eligible.length, shouldSend: true }
}

const FLIGHTS_MODULE_URL = "https://company24.pro/business-assistant/flights"

/** HTML-текст дайджеста (parse_mode=HTML) — заголовок, до 8 строк
 *  «✈️ из → в — цена + ссылка на пост + канал», в конце ссылка на модуль. */
export function buildDigestMessage(deals: FlightDeal[]): string {
  const lines = ["🔥 <b>Дешёвые билеты — дайджест за сутки</b>", ""]

  for (const deal of deals) {
    const price = deal.priceRub.toLocaleString("ru-RU")
    lines.push(
      `✈️ ${deal.routeFrom} → ${deal.routeTo} — <b>${price} ₽</b> · <a href="${deal.sourceMessageUrl}">пост</a> (@${deal.sourceChannel})`,
    )
  }

  lines.push("", `<a href="${FLIGHTS_MODULE_URL}">Все находки в Бизнес-ассистенте</a>`)
  return lines.join("\n")
}
