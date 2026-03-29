import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { requirePlatformAdmin, requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string; userId: string }> }

const ALLOWED_ROLES = [
  "director", "hr_lead", "hr_manager", "department_head", "observer",
  "platform_admin", "platform_manager", "admin", "manager",
]

// PATCH /api/admin/clients/[id]/users/[userId] — изменить роль или заблокировать пользователя
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id: companyId, userId } = await params
  const body = await req.json().catch(() => ({}))
  const { role, isActive } = body as { role?: string; isActive?: boolean }

  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return apiError("Недопустимая роль", 400)
  }

  const updateData: Record<string, unknown> = {}
  if (role !== undefined) updateData.role = role
  if (isActive !== undefined) updateData.isActive = isActive

  if (Object.keys(updateData).length === 0) {
    return apiError("Нет данных для обновления", 400)
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    .returning()

  if (!updated) return apiError("Пользователь не найден", 404)

  return apiSuccess({
    id: updated.id,
    role: updated.role,
    isActive: updated.isActive,
  })
}

// DELETE /api/admin/clients/[id]/users/[userId] — удалить пользователя компании
export async function DELETE(req: NextRequest, { params }: Params) {
  let currentUser
  try {
    currentUser = await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id: companyId, userId } = await params

  // Нельзя удалить самого себя
  if (currentUser.id === userId) {
    return apiError("Нельзя удалить собственный аккаунт", 400)
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    .limit(1)

  if (!user) return apiError("Пользователь не найден", 404)

  await db.delete(users).where(eq(users.id, userId))

  return apiSuccess({ deleted: true })
}
