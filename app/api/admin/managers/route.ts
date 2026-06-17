import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// Роли, пользователей которых можно назначить менеджером клиента.
// Включаем платформенные роли (platform_admin, platform_manager, admin) и
// собственно роли менеджеров (sales_manager, account_manager).
const ASSIGNABLE_ROLES = [
  "platform_admin",
  "platform_manager",
  "admin",
  "sales_manager",
  "account_manager",
]

// GET /api/admin/managers
// Список пользователей, которых можно назначить менеджером клиента/партнёра.
export async function GET() {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  try {
    const rows = await db
      .select({
        id:       users.id,
        name:     users.name,
        email:    users.email,
        role:     users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(
        inArray(users.role, ASSIGNABLE_ROLES),
      )
      .orderBy(users.name)

    // Фильтруем неактивных на прикладном уровне, т.к. isActive может быть null
    // (legacy-пользователи без явно выставленного флага считаются активными).
    const managers = rows.filter((u) => u.isActive !== false)

    return apiSuccess({ managers })
  } catch (err) {
    console.error("[admin/managers GET]", err)
    return apiError("Internal server error", 500)
  }
}
