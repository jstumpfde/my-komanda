import type { HotelOffer, HotelSearchParams } from "./types"

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime()
  const b = new Date(checkOut).getTime()
  const n = Math.round((b - a) / 86_400_000)
  return n > 0 ? n : 1
}

function buildHotellookDeepLink(params: HotelSearchParams): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    marker,
    destination: params.cityIata,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: String(params.adults),
  })
  return `https://search.hotellook.com/?${query.toString()}`
}

function mockOffers(params: HotelSearchParams): HotelOffer[] {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  const deepLink = buildHotellookDeepLink(params)
  const base = [
    { name: "Отель «Центральный»",   stars: 3, rating: "8.2", perNight: 3200 },
    { name: "Гранд Отель Плаза",      stars: 5, rating: "9.1", perNight: 9800 },
    { name: "Апарт-отель «Уют»",      stars: 4, rating: "8.7", perNight: 5400 },
    { name: "Хостел «Друзья»",        stars: 2, rating: "7.4", perNight: 1500 },
  ]
  return base.map((h, i) => ({
    id: `hl-mock-${params.cityIata}-${i}`,
    name: h.name,
    stars: h.stars,
    ratingLabel: h.rating,
    priceRub: h.perNight * nights,
    nights,
    deepLink,
  }))
}

interface HotellookCacheRow {
  hotelId: number
  hotelName: string
  stars: number
  priceFrom: number
  priceAvg?: number
}

async function fetchRealOffers(params: HotelSearchParams, token: string): Promise<HotelOffer[]> {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  const query = new URLSearchParams({
    location: params.cityIata,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    currency: "rub",
    limit: "10",
    token,
  })
  const res = await fetch(`https://engine.hotellook.com/api/v2/cache/latest.json?${query.toString()}`)
  if (!res.ok) throw new Error(`Hotellook API ${res.status}`)
  const body = (await res.json()) as HotellookCacheRow[]
  const deepLink = buildHotellookDeepLink(params)
  return body.map((row, i) => ({
    id: `hl-${params.cityIata}-${row.hotelId ?? i}`,
    name: row.hotelName,
    stars: row.stars ?? 0,
    ratingLabel: null,
    priceRub: Math.round(row.priceFrom),
    nights,
    deepLink,
  }))
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = token ? await fetchRealOffers(params, token) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
