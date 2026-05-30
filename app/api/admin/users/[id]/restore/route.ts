import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/admin/users/[id]/restore — вернуть из корзины (deleted_at = null).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }
  const { id } = await params
  const [u] = await db.update(users).set({ deletedAt: null }).where(eq(users.id, id)).returning({ id: users.id })
  if (!u) return apiError("Пользователь не найден", 404)
  return apiSuccess({ restored: true })
}
