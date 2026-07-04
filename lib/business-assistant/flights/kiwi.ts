import type { FlightOffer, FlightSearchParams } from "./types"

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

function mockOffers(params: FlightSearchParams): FlightOffer[] {
  const deepLink = buildClickTrackedDeepLink(buildKiwiDeepUrl(params))
  return [
    {
      id: `kiwi-mock-${params.originIata}-${params.destinationIata}-0`,
      kind: "combo" as const,
      priceRub: 18900,
      airlineLabel: "Turkish Airlines + AirAsia (через Стамбул)",
      transfers: 2,
      durationMinutes: 620,
      savingsRub: 7300,
      deepLink,
    },
  ]
}

interface TequilaRow {
  price: number; deep_link?: string; route: { airline: string }[]
}

async function fetchRealOffers(params: FlightSearchParams, apiKey: string): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    fly_from: params.originIata,
    fly_to: params.destinationIata,
    date_from: toKiwiDate(params.departDate),
    date_to: toKiwiDate(params.departDate),
    adults: String(params.adults),
    curr: "RUB",
    limit: "10",
  })
  const res = await fetch(`https://api.tequila.kiwi.com/v2/search?${query.toString()}`, {
    headers: { apikey: apiKey },
  })
  if (!res.ok) throw new Error(`Kiwi Tequila API ${res.status}`)
  const body = (await res.json()) as { data: TequilaRow[] }

  return body.data
    .filter((row) => row.route.length > 1)
    .map((row, i) => ({
      id: `kiwi-${params.originIata}-${params.destinationIata}-${i}`,
      kind: "combo" as const,
      priceRub: Math.round(row.price),
      airlineLabel: [...new Set(row.route.map((leg) => leg.airline))].join(" + "),
      transfers: row.route.length - 1,
      durationMinutes: null,
      deepLink: row.deep_link
        ? buildClickTrackedDeepLink(row.deep_link)
        : buildClickTrackedDeepLink(buildKiwiDeepUrl(params)),
    }))
}

export async function searchKiwiCombos(params: FlightSearchParams): Promise<FlightOffer[]> {
  const apiKey = process.env.KIWI_TEQUILA_API_KEY
  const offers = apiKey ? await fetchRealOffers(params, apiKey) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
