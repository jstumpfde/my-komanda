import type { FlightOffer, FlightSearchParams } from "./types"

function buildAviasalesDeepLink(params: FlightSearchParams): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    origin_iata: params.originIata,
    destination_iata: params.destinationIata,
    depart_date: params.departDate,
    adults: String(params.adults),
    marker,
  })
  if (params.returnDate) query.set("return_date", params.returnDate)
  return `https://search.aviasales.com/flights/?${query.toString()}`
}

function mockOffers(params: FlightSearchParams): FlightOffer[] {
  const airlines = ["Аэрофлот", "Победа", "S7 Airlines"]
  const deepLink = buildAviasalesDeepLink(params)
  return airlines.map((airline, i) => ({
    id: `tp-mock-${params.originIata}-${params.destinationIata}-${i}`,
    kind: "direct" as const,
    priceRub: 4500 + i * 1800,
    airlineLabel: airline,
    transfers: i === 2 ? 1 : 0,
    durationMinutes: 90 + i * 40,
    deepLink,
  }))
}

interface TravelpayoutsPriceRow {
  price: number; airline: string; transfers: number; duration: number | null
}

async function fetchRealOffers(params: FlightSearchParams, token: string): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    origin: params.originIata,
    destination: params.destinationIata,
    departure_at: params.departDate,
    sorting: "price",
    limit: "10",
    token,
  })
  if (params.returnDate) query.set("return_at", params.returnDate)

  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${query.toString()}`)
  if (!res.ok) throw new Error(`Travelpayouts API ${res.status}`)
  const body = (await res.json()) as { data: TravelpayoutsPriceRow[] }
  const deepLink = buildAviasalesDeepLink(params)

  return body.data.map((row, i) => ({
    id: `tp-${params.originIata}-${params.destinationIata}-${i}`,
    kind: "direct" as const,
    priceRub: row.price,
    airlineLabel: row.airline,
    transfers: row.transfers,
    durationMinutes: row.duration,
    deepLink,
  }))
}

export async function searchTravelpayouts(params: FlightSearchParams): Promise<FlightOffer[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = token ? await fetchRealOffers(params, token) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
