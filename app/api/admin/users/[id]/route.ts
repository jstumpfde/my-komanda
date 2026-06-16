import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAdminPanelAccess } from "@/lib/platform/auth"
import {
  accessTypeToUserRole, isAccessType, syncIntegratorForAccessType,
} from "@/lib/admin/assign-role"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/users/[id] — cross-tenant: сменить тип доступа (роль/партнёрство),
// задать пароль, перенести в другую компанию, заблокировать/разблокировать.
// Body: { role? (accessType), password?, companyId?, isActive? }
export async function PATCH(req: NextRequest, { params }: Params) {
  let currentUser
  try {
    currentUser = await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { role: accessType, isActive, password, companyId: rawCompanyId } = body as {
    role?: string; isActive?: boolean; password?: string; companyId?: string | null
  }

  if (accessType !== undefined && !isAccessType(accessType)) {
    return apiError("Недопустимый тип доступа", 400)
  }
  if (password !== undefined && (typeof password !== "string" || password.length < 6)) {
    return apiError("Пароль не короче 6 символов", 400)
  }

  // Нельзя заблокировать собственный аккаунт
  if (isActive === false && currentUser.id === id) {
    return apiError("Нельзя заблокировать собственный аккаунт", 400)
  }

  // Текущее состояние пользователя (нужно companyId для integrator-sync).
  const [target] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) return apiError("Пользователь не найден", 404)

  // Смена компании.
  const companyChange = rawCompanyId !== undefined
  const newCompanyId = companyChange ? ((rawCompanyId ?? "") || null) : target.companyId
  if (companyChange && newCompanyId) {
    const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, newCompanyId)).limit(1)
    if (!c) return apiError("Компания не найдена", 404)
  }

  const updateData: Record<string, unknown> = {}
  if (isActive !== undefined) updateData.isActive = isActive
  if (companyChange) updateData.companyId = newCompanyId
  if (password !== undefined) updateData.passwordHash = bcrypt.hashSync(password, 10)

  if (accessType !== undefined) {
    updateData.role = accessTypeToUserRole(accessType)
    // Партнёрский тип — создать/обновить integrator для companyId пользователя
    // (используем новую компанию, если её меняем этим же запросом).
    try {
      await syncIntegratorForAccessType(accessType, newCompanyId)
    } catch (e) {
      return apiError(e instanceof Error ? e.message : "Не удалось назначить партнёрский доступ", 400)
    }
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Нет данных для обновления", 400)
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning({ id: users.id, role: users.role, isActive: users.isActive, companyId: users.companyId })

  if (!updated) return apiError("Пользователь не найден", 404)

  return apiSuccess(updated)
}

// DELETE /api/admin/users/[id] — в корзину (soft-delete, обратимо).
export async function DELETE(_req: NextRequest, { params }: Params) {
  let currentUser
  try {
    currentUser = await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  if (currentUser.id === id) return apiError("Нельзя удалить собственный аккаунт", 400)

  const [updated] = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id })

  if (!updated) return apiError("Пользователь не найден", 404)
  return apiSuccess({ trashed: true })
}
