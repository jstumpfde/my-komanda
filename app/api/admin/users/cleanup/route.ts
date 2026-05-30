import { db } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"
import { isNull, inArray } from "drizzle-orm"
import { requirePlatformAdmin, apiSuccess } from "@/lib/api-helpers"

// POST /api/admin/users/cleanup — массово в корзину:
//   • наблюдатели (role = observer) — обычно демо-пользователи;
//   • осиротевшие — без компании или компания не существует.
// Обратимо (soft-delete). Возвращает количество перемещённых.
export async function POST() {
  let currentUser
  try {
    currentUser = await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const cos = await db.select({ id: companies.id }).from(companies)
  const validIds = new Set(cos.map(c => c.id))

  const rows = await db
    .select({ id: users.id, role: users.role, companyId: users.companyId })
    .from(users)
    .where(isNull(users.deletedAt))

  const toTrash = rows
    .filter(u =>
      u.id !== currentUser.id &&
      (u.role === "observer" || !u.companyId || !validIds.has(u.companyId)),
    )
    .map(u => u.id)

  if (toTrash.length === 0) return apiSuccess({ trashed: 0 })

  await db.update(users).set({ deletedAt: new Date() }).where(inArray(users.id, toTrash))
  return apiSuccess({ trashed: toTrash.length })
}
