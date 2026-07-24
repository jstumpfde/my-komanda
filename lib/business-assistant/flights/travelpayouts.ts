import type { FlightOffer, FlightSearchParams } from "./types"
import { buildDateList, seedHash } from "./date-utils"
import { UNKNOWN_BAGGAGE, mockBaggage } from "./baggage"

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

// Псевдослучайная, но воспроизводимая вариация цены/часа вылета по дате —
// чтобы в мок-режиме (без TRAVELPAYOUTS_API_TOKEN) поиск по диапазону дат
// выглядел живым, а не одинаковой ценой на каждый день.
function mockOffers(params: FlightSearchParams, date: string): FlightOffer[] {
  const airlines = ["Аэрофлот", "Победа", "S7 Airlines"]
  const deepLink = buildAviasalesDeepLink({ ...params, departDate: date })
  const cabinClass = params.tripClass ?? "economy"
  const basePrice = cabinClass === "business" ? 22000 : 4500
  return airlines.map((airline, i) => {
    const seed = seedHash(`${params.originIata}${params.destinationIata}${date}${i}`)
    const factor = 0.85 + ((seed % 100) / 100) * 0.5 // 0.85..1.35
    const price = Math.round((basePrice + i * 1800) * factor)
    const hour = seedHash(`${date}h${airline}`) % 24
    return {
      id: `tp-mock-${params.originIata}-${params.destinationIata}-${date}-${i}`,
      kind: "direct" as const,
      priceRub: price,
      airlineLabel: airline,
      transfers: i === 2 ? 1 : 0,
      durationMinutes: 90 + i * 40,
      deepLink,
      departDate: date,
      departHour: hour,
      cabinClass,
      baggage: mockBaggage(`${params.originIata}${params.destinationIata}${date}${i}`, cabinClass),
    }
  })
}

interface TravelpayoutsPriceRow {
  price: number; airline: string; transfers: number; duration: number | null; departure_at?: string
}

async function fetchRealOffers(params: FlightSearchParams, date: string, token: string): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    origin: params.originIata,
    destination: params.destinationIata,
    departure_at: date,
    sorting: "price",
    limit: "10",
    token,
    trip_class: params.tripClass === "business" ? "1" : "0",
  })
  if (params.returnDate) query.set("return_at", params.returnDate)

  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${query.toString()}`)
  if (!res.ok) throw new Error(`Travelpayouts API ${res.status}`)
  const body = (await res.json()) as { data: TravelpayoutsPriceRow[] }
  const deepLink = buildAviasalesDeepLink({ ...params, departDate: date })
  const cabinClass = params.tripClass ?? "economy"

  return body.data.map((row, i) => {
    const depDate = row.departure_at ? row.departure_at.slice(0, 10) : date
    const depHour = row.departure_at ? new Date(row.departure_at).getUTCHours() : 12
    return {
      id: `tp-${params.originIata}-${params.destinationIata}-${date}-${i}`,
      kind: "direct" as const,
      priceRub: row.price,
      airlineLabel: row.airline,
      transfers: row.transfers,
      durationMinutes: row.duration,
      deepLink,
      departDate: depDate,
      departHour: depHour,
      cabinClass,
      // Travelpayouts Data API (prices_for_dates) не отдаёт багажную норму —
      // не выдумываем цифры, честно показываем "уточняйте по тарифу".
      baggage: UNKNOWN_BAGGAGE,
    }
  })
}

export async function searchTravelpayouts(params: FlightSearchParams): Promise<FlightOffer[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  const dates = buildDateList(params.departDate, params.departDateTo)

  const perDate = await Promise.all(
    dates.map((date) => (token ? fetchRealOffers(params, date, token) : Promise.resolve(mockOffers(params, date)))),
  )
  const offers = perDate.flat()
  return offers.sort((a, b) => a.priceRub - b.priceRub)
}
