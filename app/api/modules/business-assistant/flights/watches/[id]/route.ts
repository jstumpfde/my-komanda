import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { flightPriceWatches } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

// PATCH — переключить active / изменить targetPriceRub. Только владелец
// внутри своей компании (tenant + owner isolation).
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
