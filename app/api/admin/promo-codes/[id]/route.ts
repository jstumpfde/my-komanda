import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { promoCodes } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/admin/promo-codes/[id] — переключить is_active
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    if (typeof body.isActive !== "boolean") {
      return apiError("Поле isActive обязательно", 400)
    }

    const [updated] = await db
      .update(promoCodes)
      .set({ isActive: body.isActive })
      .where(eq(promoCodes.id, id))
      .returning()

    if (!updated) return apiError("Промокод не найден", 404)
    return apiSuccess({ promoCode: updated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/promo-codes/[id] PATCH]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// DELETE /api/admin/promo-codes/[id] — удалить промокод
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { id } = await params

    const [deleted] = await db
      .delete(promoCodes)
      .where(eq(promoCodes.id, id))
      .returning({ id: promoCodes.id })

    if (!deleted) return apiError("Промокод не найден", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/promo-codes/[id] DELETE]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
