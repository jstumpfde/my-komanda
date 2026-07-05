// Мониторинг цен: общие типы и интерфейс источника (адаптера площадки).
// Первый источник — airbnb (через сайдкар), дальше добавляются без переделки ядра.

export type PriceSourceId = "airbnb"

export interface ResolvedListing {
  externalId: string
  lat: number | null
  lng: number | null
  title: string | null
  roomType: string | null
  personCapacity: number | null
  rating: unknown
}

export interface NearbyListing {
  externalId: string
  name: string | null
  lat: number | null
  lng: number | null
  distanceM: number | null
  /** Итог за весь запрошенный диапазон дат (со скидками площадки) */
  priceTotal: number | null
  rating: unknown
  raw?: unknown
}

export interface PriceQuote {
  available: boolean
  priceTotal: number | null
  pricePerNight: number | null
  nights: number
  currency: string
  raw?: unknown
}

export interface SearchNearbyParams {
  lat: number
  lng: number
  radiusM: number
  checkin: string // YYYY-MM-DD
  checkout: string // YYYY-MM-DD
  adults?: number
  currency?: string
}

export interface PriceSource {
  id: PriceSourceId
  /** Достать листинг по внешнему id (координаты, тип, вместимость) */
  resolveListing(externalId: string, currency?: string): Promise<ResolvedListing>
  /** Конкуренты в радиусе с ценой за диапазон дат */
  searchNearby(params: SearchNearbyParams): Promise<NearbyListing[]>
  /** Точечная цена листинга за диапазон дат */
  getPrice(
    externalId: string,
    checkin: string,
    checkout: string,
    opts?: { adults?: number; currency?: string },
  ): Promise<PriceQuote>
  /** Разобрать URL объявления → externalId (null, если это не ссылка источника) */
  parseListingUrl(url: string): string | null
}
