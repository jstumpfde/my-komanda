import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformInviteLinks } from "@/lib/db/schema"

import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/admin/invites/[id] — переключить is_active
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
      .update(platformInviteLinks)
      .set({ isActive: body.isActive })
      .where(eq(platformInviteLinks.id, id))
      .returning()

    if (!updated) return apiError("Ссылка не найдена", 404)
    return apiSuccess({ invite: updated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/invites/[id] PATCH]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// DELETE /api/admin/invites/[id] — удалить ссылку
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { id } = await params

    const [deleted] = await db
      .delete(platformInviteLinks)
      .where(eq(platformInviteLinks.id, id))
      .returning({ id: platformInviteLinks.id })

    if (!deleted) return apiError("Ссылка не найдена", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/invites/[id] DELETE]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
