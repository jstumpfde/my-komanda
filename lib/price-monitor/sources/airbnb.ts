import { sidecarPost } from "../sidecar-client"
import type {
  NearbyListing,
  PriceQuote,
  PriceSource,
  ResolvedListing,
  SearchNearbyParams,
} from "../types"

interface SidecarSearchResponse {
  count: number
  results: Array<{
    externalId: string
    name: string | null
    lat: number | null
    lng: number | null
    distanceM: number | null
    priceTotal: number | null
    qualifier: string | null
    rating: unknown
    raw?: unknown
  }>
}

interface SidecarPriceResponse {
  available: boolean
  priceTotal: number | null
  pricePerNight: number | null
  nights: number
  currency: string
  raw?: unknown
}

interface SidecarResolveResponse {
  externalId: string
  lat: number | null
  lng: number | null
  roomType: string | null
  personCapacity: number | null
  title: string | null
  rating: unknown
}

export const airbnbSource: PriceSource = {
  id: "airbnb",

  parseListingUrl(url: string): string | null {
    // https://www.airbnb.com/rooms/24570499?... | airbnb.ru | /rooms/plus/...
    const match = url.match(/airbnb\.[a-z.]+\/rooms\/(?:plus\/)?(\d+)/i)
    return match ? match[1] : null
  },

  async resolveListing(externalId, currency = "EUR"): Promise<ResolvedListing> {
    const data = await sidecarPost<SidecarResolveResponse>("/resolve", {
      room_id: externalId,
      currency,
    })
    return {
      externalId: data.externalId,
      lat: data.lat,
      lng: data.lng,
      title: data.title,
      roomType: data.roomType,
      personCapacity: data.personCapacity,
      rating: data.rating,
    }
  },

  async searchNearby(params: SearchNearbyParams): Promise<NearbyListing[]> {
    const data = await sidecarPost<SidecarSearchResponse>("/search", {
      lat: params.lat,
      lng: params.lng,
      radius_m: params.radiusM,
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults ?? 2,
      currency: params.currency ?? "EUR",
    })
    return data.results
  },

  async getPrice(externalId, checkin, checkout, opts): Promise<PriceQuote> {
    return sidecarPost<SidecarPriceResponse>("/price", {
      room_id: externalId,
      checkin,
      checkout,
      adults: opts?.adults ?? 2,
      currency: opts?.currency ?? "EUR",
    })
  },
}

export const PRICE_SOURCES = {
  airbnb: airbnbSource,
} as const

export function getPriceSource(id: string) {
  return id === "airbnb" ? airbnbSource : null
}
