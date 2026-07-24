import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { searchTravelpayouts } from "@/lib/business-assistant/flights/travelpayouts"
import { searchKiwiCombos } from "@/lib/business-assistant/flights/kiwi"
import { applyFlightFilters, parseTimeOfDay } from "@/lib/business-assistant/flights/filters"
import { buildDateList } from "@/lib/business-assistant/flights/date-utils"
import type {
  BaggageFilter,
  FlightFilters,
  FlightSearchParams,
  SortBy,
  StopsFilter,
  TripClass,
} from "@/lib/business-assistant/flights/types"

const VALID_TRIP_CLASS: TripClass[] = ["economy", "business"]
const VALID_STOPS: StopsFilter[] = ["any", "nonstop", "max1"]
const VALID_SORT: SortBy[] = ["price", "duration", "departure"]
const VALID_BAGGAGE: BaggageFilter[] = ["any", "checked", "handOnly"]

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const sp = req.nextUrl.searchParams
  const originIata = sp.get("origin")
  const destinationIata = sp.get("destination")
  const departDate = sp.get("departDate")
  if (!originIata || !destinationIata || !departDate) {
    return NextResponse.json(
      { error: "Нужны параметры origin, destination, departDate" },
      { status: 400 },
    )
  }

  const dateMode = sp.get("dateMode") === "range" ? "range" : "exact"

  // Диапазон = явные departDateFrom/departDateTo ИЛИ точная дата ±N дней
  // (flexDays) без явного "до" — оба сценария сводятся к одному окну дат.
  let departDateFrom = departDate
  let departDateTo = sp.get("departDateTo") ?? undefined
  const flexDays = Number(sp.get("flexDays") ?? "0")
  if (dateMode === "range" && !departDateTo && flexDays > 0) {
    const base = new Date(`${departDate}T00:00:00Z`)
    const from = new Date(base)
    from.setUTCDate(from.getUTCDate() - flexDays)
    const to = new Date(base)
    to.setUTCDate(to.getUTCDate() + flexDays)
    departDateFrom = from.toISOString().slice(0, 10)
    departDateTo = to.toISOString().slice(0, 10)
  }

  const rawTripClass = sp.get("tripClass")
  const tripClass: TripClass = VALID_TRIP_CLASS.includes(rawTripClass as TripClass)
    ? (rawTripClass as TripClass)
    : "economy"

  const params: FlightSearchParams = {
    originIata: originIata.toUpperCase(),
    destinationIata: destinationIata.toUpperCase(),
    departDate: dateMode === "range" ? departDateFrom : departDate,
    departDateTo: dateMode === "range" ? departDateTo : undefined,
    returnDate: sp.get("returnDate") ?? undefined,
    adults: Number(sp.get("adults") ?? "1"),
    tripClass,
  }

  const rawStops = sp.get("stops")
  const rawSortBy = sp.get("sortBy")
  const rawBaggage = sp.get("baggage")
  const filters: FlightFilters = {
    maxPriceRub: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
    timeOfDay: parseTimeOfDay(sp.get("timeOfDay")),
    stops: VALID_STOPS.includes(rawStops as StopsFilter) ? (rawStops as StopsFilter) : "any",
    airlines: sp.get("airlines") ? sp.get("airlines")!.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    sortBy: VALID_SORT.includes(rawSortBy as SortBy) ? (rawSortBy as SortBy) : "price",
    baggage: VALID_BAGGAGE.includes(rawBaggage as BaggageFilter) ? (rawBaggage as BaggageFilter) : "any",
    minBaggageWeightKg: sp.get("minBaggageWeightKg") ? Number(sp.get("minBaggageWeightKg")) : undefined,
    hideUnknownBaggage: sp.get("hideUnknownBaggage") === "1",
  }

  const [directRaw, comboRaw] = await Promise.all([
    searchTravelpayouts(params),
    searchKiwiCombos(params),
  ])

  const direct = applyFlightFilters(directRaw, filters)
  const combo = applyFlightFilters(comboRaw, filters)
  const airlines = [...new Set([...directRaw, ...comboRaw].map((o) => o.airlineLabel))].sort()
  const datesSearched = buildDateList(params.departDate, params.departDateTo)

  return NextResponse.json({ direct, combo, airlines, datesSearched })
}
