// Перебор дат для поиска по диапазону. Провайдер без нативной поддержки
// диапазона (Travelpayouts) опрашивается по каждой дате из списка; при
// длинном диапазоне — не более MAX_DATES точек, равномерно распределённых
// по интервалу (включая крайние даты), чтобы не устроить DDoS по API/мокам.
export const MAX_RANGE_DATES = 10

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Строит список дат YYYY-MM-DD для опроса провайдеров.
 *  Без `toISO` (или equal to `fromISO`) — одна точная дата.
 *  С диапазоном длиннее MAX_RANGE_DATES — равномерная выборка. */
export function buildDateList(fromISO: string, toISO?: string): string[] {
  if (!toISO || toISO === fromISO) return [fromISO]

  const from = new Date(`${fromISO}T00:00:00Z`)
  const to = new Date(`${toISO}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return [fromISO]
  }

  const totalDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1

  if (totalDays <= MAX_RANGE_DATES) {
    return Array.from({ length: totalDays }, (_, i) => isoAddDays(fromISO, i))
  }

  const dates = new Set<string>()
  for (let i = 0; i < MAX_RANGE_DATES; i++) {
    const offset = Math.round((i * (totalDays - 1)) / (MAX_RANGE_DATES - 1))
    dates.add(isoAddDays(fromISO, offset))
  }
  return [...dates]
}

/** Простой детерминированный хэш строки — для псевдослучайных, но
 *  воспроизводимых вариаций мок-цен/времени по датам (живой вид UI без
 *  реального провайдера, но без дребезга между рендерами одного и того же
 *  запроса). */
export function seedHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  }
  return h
}
