import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesProducts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — каталог товаров/услуг тенанта
export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select()
      .from(salesProducts)
      .where(eq(salesProducts.tenantId, user.companyId))
      .orderBy(desc(salesProducts.createdAt))
    return apiSuccess({ products: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — добавить товар/услугу (price в копейках)
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.name?.trim()) return apiError("'name' is required", 400)
    const [product] = await db
      .insert(salesProducts)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        category: body.category || null,
        description: body.description || null,
        price: typeof body.price === "number" ? body.price : 0,
        unit: body.unit || "шт",
        vat: typeof body.vat === "number" ? body.vat : 20,
        status: body.status === "archived" ? "archived" : "active",
      })
      .returning()
    return apiSuccess(product, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PATCH — обновить (статус/поля) по id в теле
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.id) return apiError("'id' is required", 400)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) set.name = body.name
    if (body.category !== undefined) set.category = body.category
    if (body.description !== undefined) set.description = body.description
    if (body.price !== undefined) set.price = body.price
    if (body.unit !== undefined) set.unit = body.unit
    if (body.vat !== undefined) set.vat = body.vat
    if (body.status !== undefined) set.status = body.status

    const [updated] = await db
      .update(salesProducts)
      .set(set)
      .where(and(eq(salesProducts.id, body.id), eq(salesProducts.tenantId, user.companyId)))
      .returning()
    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE — удалить по id в теле
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.id) return apiError("'id' is required", 400)
    const [deleted] = await db
      .delete(salesProducts)
      .where(and(eq(salesProducts.id, body.id), eq(salesProducts.tenantId, user.companyId)))
      .returning()
    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
