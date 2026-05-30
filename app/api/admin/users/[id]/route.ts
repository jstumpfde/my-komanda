import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = [
  "director", "hr_lead", "hr_manager", "department_head", "observer",
  "platform_admin", "platform_manager", "admin", "manager",
]

// PATCH /api/admin/users/[id] — cross-tenant: изменить роль или заблокировать.
export async function PATCH(req: NextRequest, { params }: Params) {
  let currentUser
  try {
    currentUser = await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { role, isActive } = body as { role?: string; isActive?: boolean }

  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return apiError("Недопустимая роль", 400)
  }

  // Нельзя заблокировать собственный аккаунт
  if (isActive === false && currentUser.id === id) {
    return apiError("Нельзя заблокировать собственный аккаунт", 400)
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
    .where(eq(users.id, id))
    .returning({ id: users.id, role: users.role, isActive: users.isActive })

  if (!updated) return apiError("Пользователь не найден", 404)

  return apiSuccess(updated)
}
