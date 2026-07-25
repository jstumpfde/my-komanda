import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { flightPriceWatches } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { isValidTelegramChatId } from "@/lib/business-assistant/flights/watch-notify"
import type { TripClass } from "@/lib/business-assistant/flights/types"

type Ctx = { params: Promise<{ id: string }> }

const VALID_TRIP_CLASS: TripClass[] = ["economy", "business"]

// PATCH — редактирование отслеживания целиком (форма "Новое отслеживание"
// переиспользуется и для правки) или частично (переключить active, задать
// targetPriceRub). Только владелец внутри своей компании (tenant + owner).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const { id } = await ctx.params
  const body = await req.json()

  const updates: Record<string, unknown> = {}
  if (typeof body.active === "boolean") updates.active = body.active
  if (body.targetPriceRub === null || typeof body.targetPriceRub === "number") {
    updates.targetPriceRub = body.targetPriceRub
  }
  if (typeof body.originIata === "string" && body.originIata.trim()) {
    updates.originIata = body.originIata.trim().toUpperCase()
  }
  if (typeof body.destinationIata === "string" && body.destinationIata.trim()) {
    updates.destinationIata = body.destinationIata.trim().toUpperCase()
  }
  if (body.dateMode === "exact" || body.dateMode === "range") updates.dateMode = body.dateMode
  if (typeof body.departDate === "string" && body.departDate) updates.departDate = body.departDate
  if (body.departDateTo === null || typeof body.departDateTo === "string") updates.departDateTo = body.departDateTo || null
  if (VALID_TRIP_CLASS.includes(body.tripClass as TripClass)) updates.tripClass = body.tripClass
  if (body.filters && typeof body.filters === "object") updates.filtersJson = body.filters
  if (typeof body.notifyTelegram === "boolean") updates.notifyTelegram = body.notifyTelegram
  if (body.telegramChatId === null || typeof body.telegramChatId === "string") {
    const chatId = (body.telegramChatId ?? "").trim() || null
    if (chatId && !isValidTelegramChatId(chatId)) {
      return NextResponse.json({ error: "Некорректный chat ID Telegram" }, { status: 400 })
    }
    updates.telegramChatId = chatId
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 })
  }

  const [watch] = await db
    .update(flightPriceWatches)
    .set(updates)
    .where(
      and(
        eq(flightPriceWatches.id, id),
        eq(flightPriceWatches.companyId, user.companyId),
        eq(flightPriceWatches.userId, user.id),
      ),
    )
    .returning()

  if (!watch) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
  return NextResponse.json({ watch })
}

// DELETE — удалить отслеживание. Только владелец внутри своей компании.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const { id } = await ctx.params

  const [deleted] = await db
    .delete(flightPriceWatches)
    .where(
      and(
        eq(flightPriceWatches.id, id),
        eq(flightPriceWatches.companyId, user.companyId),
        eq(flightPriceWatches.userId, user.id),
      ),
    )
    .returning()

  if (!deleted) return NextResponse.json({ error: "Не найдено" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
