import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { runFlightSearch, cheapestPrice } from "@/lib/business-assistant/flights/run-search"
import { getMonthPriceMatrix, buildBuyTimingRecommendation } from "@/lib/business-assistant/flights/buy-timing"
import type { FlightSearchParams, TripClass } from "@/lib/business-assistant/flights/types"

const VALID_TRIP_CLASS: TripClass[] = ["economy", "business"]

// GET /api/modules/business-assistant/flights/buy-timing?origin=MOW&destination=LED&departDate=2026-08-15&tripClass=economy
// Рекомендация "покупать сейчас / можно подождать / следить" для точной даты
// вылета (диапазон дат сюда не имеет смысла — привязка к одной дате).
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
  const rawTripClass = sp.get("tripClass")
  const tripClass: TripClass = VALID_TRIP_CLASS.includes(rawTripClass as TripClass)
    ? (rawTripClass as TripClass)
    : "economy"

  const params: FlightSearchParams = {
    originIata: originIata.toUpperCase(),
    destinationIata: destinationIata.toUpperCase(),
    departDate,
    adults: 1,
    tripClass,
  }

  const result = await runFlightSearch(params)
  const currentPriceRub = cheapestPrice(result) ?? 5000 // если предложений нет — берём условную базу для календаря

  const { matrix, approximate } = await getMonthPriceMatrix(
    params.originIata,
    params.destinationIata,
    departDate,
    currentPriceRub,
  )

  const recommendation = buildBuyTimingRecommendation({
    originIata: params.originIata,
    destinationIata: params.destinationIata,
    departDate,
    currentPriceRub,
    monthMatrix: matrix,
    approximate,
  })

  return NextResponse.json(recommendation)
}
