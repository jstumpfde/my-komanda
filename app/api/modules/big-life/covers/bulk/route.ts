// Массовое редактирование обложек Big Life — применить один и тот же патч
// (цена/скидка/остаток/наличие/видимость) сразу к нескольким записям, либо
// массово удалить. Используется табличным видом /big-life/covers.
// ВАЖНО: WHERE всегда включает companyId — иначе id чужой компании можно
// подсунуть в ids[] и задеть чужие записи (IDOR).
import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { bigLifeCovers } from "@/lib/db/schema"
import { requireBigLifeAccess } from "@/lib/big-life/auth"

export const dynamic = "force-dynamic"

type BulkPatch = Partial<{
  price: number | null
  salePrice: number | null
  stockQty: number | null
  soldOut: boolean
  isActive: boolean
}>

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
    const ids: unknown = body.ids
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === "string")) {
      return NextResponse.json({ error: "ids: string[] обязателен" }, { status: 400 })
    }
    const patch: BulkPatch = {}
    if ("price" in body) patch.price = typeof body.price === "number" ? body.price : null
    if ("salePrice" in body) patch.salePrice = typeof body.salePrice === "number" ? body.salePrice : null
    if ("stockQty" in body) patch.stockQty = typeof body.stockQty === "number" ? body.stockQty : null
    if (typeof body.soldOut === "boolean") patch.soldOut = body.soldOut
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "empty patch" }, { status: 400 })
    }

    const rows = await db
      .update(bigLifeCovers)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(inArray(bigLifeCovers.id, ids), eq(bigLifeCovers.companyId, user.companyId)))
      .returning({ id: bigLifeCovers.id })
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err) {
    console.error("[modules/big-life/covers/bulk PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let user
  try {
    user = await requireBigLifeAccess()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const ids: unknown = body.ids
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === "string")) {
      return NextResponse.json({ error: "ids: string[] обязателен" }, { status: 400 })
    }
    const rows = await db
      .delete(bigLifeCovers)
      .where(and(inArray(bigLifeCovers.id, ids), eq(bigLifeCovers.companyId, user.companyId)))
      .returning({ id: bigLifeCovers.id })
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err) {
    console.error("[modules/big-life/covers/bulk DELETE]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
