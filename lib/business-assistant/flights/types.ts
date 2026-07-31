export type TripClass  = "economy" | "business"
export type StopsFilter = "any" | "nonstop" | "max1"
export type TimeOfDay   = "morning" | "day" | "evening" | "night"  // утро/день/вечер/ночь
export type SortBy      = "price" | "duration" | "departure"
export type BaggageFilter = "any" | "checked" | "handOnly"  // неважно / с багажом / только ручная кладь

// null-поле = данного места нет (нет ручной клади / нет регистрируемого багажа).
// unknown = провайдер вообще не отдаёт багажную информацию (Travelpayouts Data
// API) — тогда НЕ выдумываем цифры, UI показывает «уточняйте по тарифу».
export interface BaggageAllowance {
  handLuggage:      { pieces: number; weightKg: number } | null
  checkedBaggage:    { pieces: number; weightKg: number } | null
  unknown:           boolean
  worstSegmentNote?: string  // для combo — «по худшему из перелётов маршрута»
}

export interface FlightSearchParams {
  originIata:      string  // IATA код города/аэропорта вылета, напр. "MOW"
  destinationIata: string  // IATA код города/аэропорта прилёта, напр. "LED"
  departDate:      string  // YYYY-MM-DD. В режиме диапазона — начало диапазона ("дата от")
  departDateTo?:   string  // YYYY-MM-DD, режим диапазона — конец диапазона ("дата до")
  returnDate?:     string  // YYYY-MM-DD, если есть — round-trip
  adults:          number
  tripClass?:      TripClass  // по умолчанию economy
}

// Серверные фильтры результатов поиска — применяются к прямым и составным
// маршрутам одинаково, после получения предложений от всех провайдеров.
export interface FlightFilters {
  maxPriceRub?:         number
  timeOfDay?:           TimeOfDay[]    // мультивыбор по времени вылета
  stops?:               StopsFilter
  airlines?:            string[]       // мультивыбор по airlineLabel
  sortBy?:               SortBy         // по умолчанию price
  baggage?:              BaggageFilter  // по умолчанию any
  minBaggageWeightKg?:   number         // применяется только при baggage === "checked"
  hideUnknownBaggage?:   boolean        // скрывать предложения без данных о багаже (иначе — оставляем с бейджем)
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
  departDate:      string   // YYYY-MM-DD — конкретная дата этого предложения (важно для диапазона)
  departHour:      number   // 0-23 — час вылета, для фильтра по времени суток
  cabinClass:      TripClass
  baggage:         BaggageAllowance
}

export interface FlightSearchResult {
  direct:        FlightOffer[]
  combo:         FlightOffer[]
  datesSearched: string[]   // какие даты фактически были опрошены (диапазон мог быть выборочно просэмплирован)
  airlines:      string[]   // уникальные авиакомпании среди найденных — для UI-фильтра
}
