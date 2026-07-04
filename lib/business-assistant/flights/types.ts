export interface FlightSearchParams {
  originIata:      string  // IATA код города/аэропорта вылета, напр. "MOW"
  destinationIata: string  // IATA код города/аэропорта прилёта, напр. "LED"
  departDate:      string  // YYYY-MM-DD
  returnDate?:     string  // YYYY-MM-DD, если есть — round-trip
  adults:          number
}

export interface FlightOffer {
  id:              string
  kind:            "direct" | "combo"
  priceRub:        number
  airlineLabel:    string   // "Аэрофлот" или "Аэрофлот + Победа" для combo
  transfers:       number
  durationMinutes: number | null
  savingsRub?:     number   // только для kind === "combo"
  deepLink:        string
}

export interface FlightSearchResult {
  direct: FlightOffer[]
  combo:  FlightOffer[]
}
