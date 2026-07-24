import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { flightPriceWatches } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import type { FlightFilters, TripClass } from "@/lib/business-assistant/flights/types"

const VALID_TRIP_CLASS: TripClass[] = ["economy", "business"]

// GET — «Мои отслеживания»: только свои (userId) в пределах своей компании
// (companyId) — двойная изоляция, tenant + owner.
export async function GET() {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const watches = await db
    .select()
    .from(flightPriceWatches)
    .where(and(eq(flightPriceWatches.companyId, user.companyId), eq(flightPriceWatches.userId, user.id)))
    .orderBy(desc(flightPriceWatches.createdAt))

  return NextResponse.json({ watches })
}

interface CreateWatchBody {
  originIata:      string
  destinationIata: string
  dateMode:        "exact" | "range"
  departDate:      string
  departDateTo?:   string | null
  tripClass?:      TripClass
  filters?:        FlightFilters
  targetPriceRub?: number | null
}

// POST — создать отслеживание из текущего поиска (маршрут+даты+класс+фильтры).
export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const body = (await req.json()) as CreateWatchBody
  if (!body.originIata || !body.destinationIata || !body.departDate) {
    return NextResponse.json(
      { error: "Нужны originIata, destinationIata, departDate" },
      { status: 400 },
    )
  }
  const tripClass: TripClass = VALID_TRIP_CLASS.includes(body.tripClass as TripClass)
    ? (body.tripClass as TripClass)
    : "economy"

  const [watch] = await db
    .insert(flightPriceWatches)
    .values({
      companyId:       user.companyId,
      userId:          user.id,
      originIata:      body.originIata.toUpperCase(),
      destinationIata: body.destinationIata.toUpperCase(),
      dateMode:        body.dateMode === "range" ? "range" : "exact",
      departDate:      body.departDate,
      departDateTo:    body.dateMode === "range" ? (body.departDateTo ?? null) : null,
      tripClass,
      filtersJson:     (body.filters as Record<string, unknown> | undefined) ?? null,
      targetPriceRub:  body.targetPriceRub ?? null,
      active:           true,
    })
    .returning()

  return NextResponse.json({ watch }, { status: 201 })
}
