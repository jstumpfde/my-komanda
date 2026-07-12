// Заказы из корзины Big Life (biglife.company24.pro) — GET список для админки
// /big-life/orders, PATCH смена статуса. Пишет POST /api/public/big-life/orders
// (публичный чекаут статики). Big Life — обычный тенант (lib/big-life/auth.ts).
import { NextRequest, NextResponse } from "next/server"
import { desc, eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bigLifeOrders } from "@/lib/db/schema"
import { requireBigLifeAccess } from "@/lib/big-life/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  let user
  try {
    user = await requireBigLifeAccess()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const rows = await db
      .select()
      .from(bigLifeOrders)
      .where(eq(bigLifeOrders.companyId, user.companyId))
      .orderBy(desc(bigLifeOrders.createdAt))
    return NextResponse.json({ orders: rows })
  } catch (err) {
    console.error("[modules/big-life/orders GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let user
  try {
    user = await requireBigLifeAccess()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const id = typeof body.id === "string" ? body.id : ""
    const status = typeof body.status === "string" ? body.status : ""
    if (!id || !["new", "contacted", "done", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "id и корректный status обязательны" }, { status: 400 })
    }
    const [row] = await db
      .update(bigLifeOrders)
      .set({ status })
      .where(and(eq(bigLifeOrders.id, id), eq(bigLifeOrders.companyId, user.companyId)))
      .returning()
    if (!row) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 })
    return NextResponse.json({ order: row })
  } catch (err) {
    console.error("[modules/big-life/orders PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
