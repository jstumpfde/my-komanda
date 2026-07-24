// Логика решения «уведомлять ли о падении цены» для крона
// /api/cron/flight-price-watch — вынесена в чистые функции, чтобы
// тестировать без БД/сети.
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
