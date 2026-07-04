import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { searchTravelpayouts } from "@/lib/business-assistant/flights/travelpayouts"
import { searchKiwiCombos } from "@/lib/business-assistant/flights/kiwi"
import type { FlightSearchParams } from "@/lib/business-assistant/flights/types"

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

  const params: FlightSearchParams = {
    originIata: originIata.toUpperCase(),
    destinationIata: destinationIata.toUpperCase(),
    departDate,
    returnDate: sp.get("returnDate") ?? undefined,
    adults: Number(sp.get("adults") ?? "1"),
  }

  const [direct, combo] = await Promise.all([
    searchTravelpayouts(params),
    searchKiwiCombos(params),
  ])

  return NextResponse.json({ direct, combo })
}
