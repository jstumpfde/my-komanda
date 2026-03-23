import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/auth/me — текущий пользователь
export async function GET() {
  try {
    const session = await requireAuth()

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        companyId: users.companyId,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1)

    if (!user) return apiError("Пользователь не найден", 404)

    return apiSuccess(user)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[auth/me GET] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PATCH /api/auth/me — обновить имя / пароль / companyId
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth()

    const body = await req.json() as {
      companyId?: unknown
      name?: unknown
      currentPassword?: unknown
      newPassword?: unknown
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}

    // ── companyId ──────────────────────────────────────────
    if (body.companyId !== undefined) {
      if (typeof body.companyId !== "string") {
        return apiError("'companyId' должен быть строкой", 400)
      }
      updates.companyId = body.companyId
    }

    // ── name ───────────────────────────────────────────────
    if (body.name !== undefined) {
      const name = (body.name as string).trim()
      if (!name) return apiError("Имя не может быть пустым", 400)
      if (name.length > 100) return apiError("Имя слишком длинное", 400)
      updates.name = name
    }

    // ── password change ────────────────────────────────────
    if (body.newPassword !== undefined) {
      const currentPassword = body.currentPassword
      const newPassword = body.newPassword

      if (typeof currentPassword !== "string" || !currentPassword) {
        return apiError("Укажите текущий пароль", 400)
      }
      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return apiError("Новый пароль — минимум 6 символов", 400)
      }

      // Verify current password
      const [dbUser] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, session.id))
        .limit(1)

      if (!dbUser) return apiError("Пользователь не найден", 404)

      const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash)
      if (!valid) return apiError("Неверный текущий пароль", 400)

      updates.passwordHash = await bcrypt.hash(newPassword, 10)
    }

    if (Object.keys(updates).length === 0) {
      return apiError("Нет данных для обновления", 400)
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, session.id))

    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[auth/me PATCH] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
