import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { parseTimeOfDay } from "@/lib/business-assistant/flights/filters"
import { runFlightSearch } from "@/lib/business-assistant/flights/run-search"
import { resolveDateRange } from "@/lib/business-assistant/flights/date-utils"
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
  const flexDays = Number(sp.get("flexDays") ?? "0")
  const resolved = resolveDateRange(dateMode, departDate, sp.get("departDateTo") ?? undefined, flexDays)

  const rawTripClass = sp.get("tripClass")
  const tripClass: TripClass = VALID_TRIP_CLASS.includes(rawTripClass as TripClass)
    ? (rawTripClass as TripClass)
    : "economy"

  const params: FlightSearchParams = {
    originIata: originIata.toUpperCase(),
    destinationIata: destinationIata.toUpperCase(),
    departDate: resolved.departDate,
    departDateTo: resolved.departDateTo,
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

  const result = await runFlightSearch(params, filters)

  // Работаем только на Travelpayouts (решение Юрия) — Kiwi/combo не участвует
  // в демо-плашке: пока нет KIWI_TEQUILA_API_KEY, combo вообще не генерится
  // (см. searchKiwiCombos), так что демо-статус зависит только от TP-токена.
  const demoData = !process.env.TRAVELPAYOUTS_API_TOKEN

  return NextResponse.json({ ...result, demoData })
}
