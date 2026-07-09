// PATCH — обновить карточку обложки (цена/скидка/остаток/наличие/порядок/…).
// DELETE — удалить карточку из архива.
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bigLifeCovers } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

type Patch = Partial<{
  title: string
  heading: string
  period: string | null
  year: string
  imagePath: string | null
  price: number | null
  salePrice: number | null
  stockQty: number | null
  soldOut: boolean
  isActive: boolean
  sortOrder: number
}>

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await ctx.params
  try {
    const body = await req.json().catch(() => ({}))
    const patch: Patch = {}
    if (typeof body.title === "string") patch.title = body.title.trim()
    if (typeof body.heading === "string") patch.heading = body.heading.trim()
    if (typeof body.year === "string") patch.year = body.year.trim()
    if ("period" in body) patch.period = typeof body.period === "string" && body.period.trim() ? body.period.trim() : null
    if ("imagePath" in body) patch.imagePath = typeof body.imagePath === "string" && body.imagePath.trim() ? body.imagePath.trim() : null
    if ("price" in body) patch.price = typeof body.price === "number" ? body.price : null
    if ("salePrice" in body) patch.salePrice = typeof body.salePrice === "number" ? body.salePrice : null
    if ("stockQty" in body) patch.stockQty = typeof body.stockQty === "number" ? body.stockQty : null
    if (typeof body.soldOut === "boolean") patch.soldOut = body.soldOut
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "empty patch" }, { status: 400 })
    }

    const [row] = await db
      .update(bigLifeCovers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(bigLifeCovers.id, id))
      .returning()
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ cover: row })
  } catch (err) {
    console.error("[platform/big-life/covers/:id PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await ctx.params
  try {
    const [row] = await db.delete(bigLifeCovers).where(eq(bigLifeCovers.id, id)).returning({ id: bigLifeCovers.id })
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[platform/big-life/covers/:id DELETE]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
