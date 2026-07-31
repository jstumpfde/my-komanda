import type { BaggageAllowance, FlightOffer, FlightSearchParams } from "./types"

function toKiwiDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

function buildClickTrackedDeepLink(kiwiDeepUrl: string): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    shmarker: marker,
    promo_id: "3791",
    source_type: "customlink",
    type: "click",
    custom_url: kiwiDeepUrl,
  })
  return `https://c111.travelpayouts.com/click?${query.toString()}`
}

function buildKiwiDeepUrl(params: FlightSearchParams): string {
  const query = new URLSearchParams({
    from: params.originIata,
    to: params.destinationIata,
    departure: params.departDate,
  })
  if (params.returnDate) query.set("return", params.returnDate)
  return `https://www.kiwi.com/deep?${query.toString()}`
}

interface TequilaRow {
  price: number
  deep_link?: string
  route: { airline: string }[]
  local_departure?: string
  baglimit?: { hand_weight?: number; hold_weight?: number }
}

// Tequila отдаёт единый baglimit на весь итинерарий (не по каждому плечу
// отдельно) — по сути это уже "худшее из перелётов маршрута", как и
// требуется для combo: Kiwi сама схлопывает к общему знаменателю между
// разными перевозчиками.
function baggageFromTequilaRow(row: TequilaRow): BaggageAllowance {
  const bl = row.baglimit
  if (!bl || (bl.hand_weight == null && bl.hold_weight == null)) {
    return { handLuggage: null, checkedBaggage: null, unknown: true }
  }
  return {
    handLuggage: bl.hand_weight ? { pieces: 1, weightKg: bl.hand_weight } : null,
    checkedBaggage: bl.hold_weight ? { pieces: 1, weightKg: bl.hold_weight } : null,
    unknown: false,
    worstSegmentNote: row.route.length > 1 ? "по худшему из перелётов маршрута" : undefined,
  }
}

async function fetchRealOffers(params: FlightSearchParams, apiKey: string): Promise<FlightOffer[]> {
  const dateFrom = params.departDate
  const dateTo = params.departDateTo ?? params.departDate
  const cabinClass = params.tripClass ?? "economy"
  const query = new URLSearchParams({
    fly_from: params.originIata,
    fly_to: params.destinationIata,
    date_from: toKiwiDate(dateFrom),
    date_to: toKiwiDate(dateTo), // Kiwi Tequila нативно поддерживает диапазон — без перебора
    adults: String(params.adults),
    curr: "RUB",
    limit: "20",
    selected_cabins: cabinClass === "business" ? "C" : "M",
  })
  const res = await fetch(`https://api.tequila.kiwi.com/v2/search?${query.toString()}`, {
    headers: { apikey: apiKey },
  })
  if (!res.ok) throw new Error(`Kiwi Tequila API ${res.status}`)
  const body = (await res.json()) as { data: TequilaRow[] }

  return body.data
    .filter((row) => row.route.length > 1)
    .map((row, i) => {
      const depDate = row.local_departure ? row.local_departure.slice(0, 10) : dateFrom
      const depHour = row.local_departure ? new Date(row.local_departure).getUTCHours() : 12
      return {
        id: `kiwi-${params.originIata}-${params.destinationIata}-${depDate}-${i}`,
        kind: "combo" as const,
        priceRub: Math.round(row.price),
        airlineLabel: [...new Set(row.route.map((leg) => leg.airline))].join(" + "),
        transfers: row.route.length - 1,
        durationMinutes: null,
        deepLink: row.deep_link
          ? buildClickTrackedDeepLink(row.deep_link)
          : buildClickTrackedDeepLink(buildKiwiDeepUrl(params)),
        departDate: depDate,
        departHour: depHour,
        cabinClass,
        baggage: baggageFromTequilaRow(row),
      }
    })
}

// Решение Юрия (27.07): пока нет ключа Kiwi — работаем только на
// Travelpayouts. Блок «Составные маршруты» combo-предложений НЕ мокаем и НЕ
// показываем вовсе (страница/бот скрывают блок при пустом массиве) — раньше
// мок генерился всегда и создавал видимость рабочего Kiwi-источника.
export async function searchKiwiCombos(params: FlightSearchParams): Promise<FlightOffer[]> {
  const apiKey = process.env.KIWI_TEQUILA_API_KEY
  if (!apiKey) return []
  const offers = await fetchRealOffers(params, apiKey)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
