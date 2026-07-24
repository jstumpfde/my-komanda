// Общая логика прогона поиска рейсов — используется и API-роутом
// /api/modules/business-assistant/flights/search (ручной поиск), и кроном
// /api/cron/flight-price-watch (переигрывает сохранённый поиск). Не
// дублировать вызовы провайдеров/фильтрацию в обоих местах.
import { searchTravelpayouts } from "./travelpayouts"
import { searchKiwiCombos } from "./kiwi"
import { applyFlightFilters } from "./filters"
import { buildDateList } from "./date-utils"
import type { FlightFilters, FlightSearchParams, FlightSearchResult } from "./types"

export async function runFlightSearch(
  params: FlightSearchParams,
  filters?: FlightFilters,
): Promise<FlightSearchResult> {
  const [directRaw, comboRaw] = await Promise.all([
    searchTravelpayouts(params),
    searchKiwiCombos(params),
  ])

  const direct = applyFlightFilters(directRaw, filters)
  const combo = applyFlightFilters(comboRaw, filters)
  const airlines = [...new Set([...directRaw, ...comboRaw].map((o) => o.airlineLabel))].sort()
  const datesSearched = buildDateList(params.departDate, params.departDateTo)

  return { direct, combo, airlines, datesSearched }
}

/** Минимальная цена среди всех найденных предложений (прямых и составных) —
 *  «текущая цена» для отслеживания. null, если предложений нет. */
export function cheapestPrice(result: FlightSearchResult): number | null {
  const all = [...result.direct, ...result.combo]
  if (all.length === 0) return null
  return Math.min(...all.map((o) => o.priceRub))
}
