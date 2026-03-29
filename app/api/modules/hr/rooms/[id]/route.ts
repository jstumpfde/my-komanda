import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { rooms } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and } from "drizzle-orm"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const [existing] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.companyId, user.companyId)))

    if (!existing) return apiError("Переговорная не найдена", 404)

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.capacity !== undefined) updateData.capacity = body.capacity
    if (body.equipment !== undefined) updateData.equipment = body.equipment
    if (body.floor !== undefined) updateData.floor = body.floor
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const [updated] = await db
      .update(rooms)
      .set(updateData)
      .where(eq(rooms.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.companyId, user.companyId)))

    if (!existing) return apiError("Переговорная не найдена", 404)

    // Soft delete
    await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, id))
    return apiSuccess({ success: true })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
