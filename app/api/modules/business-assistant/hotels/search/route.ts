import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { searchHotels } from "@/lib/business-assistant/hotels/hotellook"
import type { HotelSearchParams } from "@/lib/business-assistant/hotels/types"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const sp = req.nextUrl.searchParams
  const cityIata = sp.get("city")
  const checkIn = sp.get("checkIn")
  const checkOut = sp.get("checkOut")
  if (!cityIata || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Нужны параметры city, checkIn, checkOut" }, { status: 400 })
  }

  const params: HotelSearchParams = {
    cityIata: cityIata.toUpperCase(),
    checkIn,
    checkOut,
    adults: Number(sp.get("adults") ?? "2"),
  }
  const hotels = await searchHotels(params)
  return NextResponse.json({ hotels })
}
