import type { FlightFilters, FlightOffer, TimeOfDay } from "./types"

function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 12) return "morning"
  if (hour >= 12 && hour < 18) return "day"
  if (hour >= 18 && hour < 24) return "evening"
  return "night"
}

/** Применяет серверные фильтры (цена/время суток/пересадки/авиакомпании) и
 *  сортировку к списку предложений — одинаково для прямых и составных
 *  маршрутов. */
export function applyFlightFilters(offers: FlightOffer[], filters?: FlightFilters): FlightOffer[] {
  let result = offers

  if (filters?.maxPriceRub != null) {
    const max = filters.maxPriceRub
    result = result.filter((o) => o.priceRub <= max)
  }

  if (filters?.timeOfDay && filters.timeOfDay.length > 0) {
    const allowed = new Set(filters.timeOfDay)
    result = result.filter((o) => allowed.has(timeOfDayForHour(o.departHour)))
  }

  if (filters?.stops && filters.stops !== "any") {
    if (filters.stops === "nonstop") {
      result = result.filter((o) => o.transfers === 0)
    } else if (filters.stops === "max1") {
      result = result.filter((o) => o.transfers <= 1)
    }
  }

  if (filters?.airlines && filters.airlines.length > 0) {
    const allowed = new Set(filters.airlines)
    result = result.filter((o) => allowed.has(o.airlineLabel))
  }

  if (filters?.baggage && filters.baggage !== "any") {
    result = result.filter((o) => {
      // Без данных о багаже (Travelpayouts) — по умолчанию НЕ скрываем молча,
      // просто помечаем бейджем на карточке; hideUnknownBaggage — явный тумблер.
      if (o.baggage.unknown) return !filters.hideUnknownBaggage

      if (filters.baggage === "handOnly") return o.baggage.checkedBaggage === null

      // baggage === "checked"
      if (!o.baggage.checkedBaggage) return false
      if (filters.minBaggageWeightKg != null && o.baggage.checkedBaggage.weightKg < filters.minBaggageWeightKg) {
        return false
      }
      return true
    })
  }

  const sortBy = filters?.sortBy ?? "price"
  const sorted = [...result]
  if (sortBy === "price") {
    sorted.sort((a, b) => a.priceRub - b.priceRub)
  } else if (sortBy === "duration") {
    sorted.sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity))
  } else if (sortBy === "departure") {
    sorted.sort((a, b) => {
      if (a.departDate !== b.departDate) return a.departDate < b.departDate ? -1 : 1
      return a.departHour - b.departHour
    })
  }
  return sorted
}

export function parseTimeOfDay(raw: string | null): TimeOfDay[] | undefined {
  if (!raw) return undefined
  const valid: TimeOfDay[] = ["morning", "day", "evening", "night"]
  const parsed = raw.split(",").map((s) => s.trim()).filter((s): s is TimeOfDay => (valid as string[]).includes(s))
  return parsed.length > 0 ? parsed : undefined
}
