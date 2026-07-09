// Обложки Big Life (архив biglife.company24.pro/Big Life Covers.dc.html) —
// GET список для админки, POST — создать новую карточку. Big Life — обычный
// тенант (см. lib/big-life/auth.ts), все записи скопированы под companyId.
import { NextRequest, NextResponse } from "next/server"
import { asc, eq, count as sqlCount } from "drizzle-orm"
import { db } from "@/lib/db"
import { bigLifeCovers } from "@/lib/db/schema"
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
      .from(bigLifeCovers)
      .where(eq(bigLifeCovers.companyId, user.companyId))
      .orderBy(asc(bigLifeCovers.sortOrder))
    return NextResponse.json({ covers: rows })
  } catch (err) {
    console.error("[modules/big-life/covers GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireBigLifeAccess()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const heading = typeof body.heading === "string" ? body.heading.trim() : ""
    const year = typeof body.year === "string" ? body.year.trim() : ""
    if (!title || !heading || !year) {
      return NextResponse.json({ error: "title, heading, year обязательны" }, { status: 400 })
    }
    const [{ count: countRaw }] = await db
      .select({ count: sqlCount() })
      .from(bigLifeCovers)
      .where(eq(bigLifeCovers.companyId, user.companyId))
    const nextOrder = Number(countRaw)
    const [row] = await db
      .insert(bigLifeCovers)
      .values({
        companyId: user.companyId,
        title,
        heading,
        year,
        period: typeof body.period === "string" && body.period.trim() ? body.period.trim() : null,
        imagePath: typeof body.imagePath === "string" && body.imagePath.trim() ? body.imagePath.trim() : null,
        price: typeof body.price === "number" ? body.price : null,
        salePrice: typeof body.salePrice === "number" ? body.salePrice : null,
        stockQty: typeof body.stockQty === "number" ? body.stockQty : null,
        soldOut: body.soldOut === true,
        isActive: body.isActive !== false,
        sortOrder: nextOrder,
      })
      .returning()
    return NextResponse.json({ cover: row })
  } catch (err) {
    console.error("[modules/big-life/covers POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
