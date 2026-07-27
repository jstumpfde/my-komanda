import { NextRequest, NextResponse } from "next/server"
import { desc, ilike, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { flightDeals } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { refreshFlightDealsIfStale } from "@/lib/business-assistant/flights/deals-cache"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get("page") ?? "1"))
  const pageSize = 30 // с расширением списка каналов (Группа TG-каналов, 27.07) — не даём ленте расплываться
  const direction = sp.get("direction")?.trim() // фильтр по направлению — "Москва", "Дубай" и т.п.
  const force = sp.get("force") === "1"

  let refreshError: string | null = null
  try {
    await refreshFlightDealsIfStale(force)
  } catch (e) {
    // Сеть/Telegram недоступны — отдаём текущий кэш из БД, не роняем эндпоинт.
    refreshError = e instanceof Error ? e.message : "Не удалось обновить ленту"
  }

  const whereClause = direction
    ? or(ilike(flightDeals.routeFrom, `%${direction}%`), ilike(flightDeals.routeTo, `%${direction}%`))
    : undefined

  const deals = await db
    .select()
    .from(flightDeals)
    .where(whereClause)
    .orderBy(desc(flightDeals.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return NextResponse.json({ deals, refreshError })
}
