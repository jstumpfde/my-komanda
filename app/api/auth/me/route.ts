import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// GET /api/auth/me — текущий пользователь
export async function GET() {
  try {
    const session = await requireAuth()

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        companyId: users.companyId,
        avatarUrl: users.avatarUrl,
        customSchedule: users.customSchedule,
        managerReminderChatId: users.managerReminderChatId,
        contactTelegram: users.contactTelegram,
        contactMax: users.contactMax,
        contactPhone: users.contactPhone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1)

    if (!user) return apiError("Пользователь не найден", 404)

    // Платформенный админ (PLATFORM_ADMIN_EMAILS) — для UI-гейтов (например
    // «Назначить анкету всем компаниям» в библиотеке). Мутации всё равно
    // перепроверяются на сервере.
    return apiSuccess({ ...user, isPlatformAdmin: isPlatformAdminEmail(user.email) })
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
      firstName?: unknown
      lastName?: unknown
      newEmail?: unknown
      currentPassword?: unknown
      newPassword?: unknown
      customSchedule?: unknown
      managerReminderChatId?: unknown
      contactTelegram?: unknown
      contactMax?: unknown
      contactPhone?: unknown
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}

    // ── customSchedule (личный график сотрудника, Профиль) ──
    if (body.customSchedule !== undefined) {
      const cs = body.customSchedule
      if (cs !== null && (typeof cs !== "object" || Array.isArray(cs))) {
        return apiError("'customSchedule' должен быть объектом", 400)
      }
      updates.customSchedule = cs
    }

    // ── managerReminderChatId (отвязка бота напоминаний) ────
    // Привязка идёт ТОЛЬКО через /start <код> в самом боте (webhook) — здесь
    // разрешён исключительно сброс на null (кнопка «Отключить» в Профиле).
    if (body.managerReminderChatId !== undefined) {
      if (body.managerReminderChatId !== null) {
        return apiError("managerReminderChatId можно только сбросить (null)", 400)
      }
      updates.managerReminderChatId = null
    }

    // ── Контакты для оперативной связи с кандидатом (Юрий 10.07) ──
    if (body.contactTelegram !== undefined) {
      const v = typeof body.contactTelegram === "string" ? body.contactTelegram.trim() : ""
      updates.contactTelegram = v.slice(0, 200) || null
    }
    if (body.contactMax !== undefined) {
      const v = typeof body.contactMax === "string" ? body.contactMax.trim() : ""
      updates.contactMax = v.slice(0, 200) || null
    }
    if (body.contactPhone !== undefined) {
      const v = typeof body.contactPhone === "string" ? body.contactPhone.trim() : ""
      updates.contactPhone = v.slice(0, 50) || null
    }

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

    // ── firstName / lastName (миграция 0209) ───────────────
    // Принимаем раздельно; если заданы оба — синхронизируем name = "Имя Фамилия".
    if (body.firstName !== undefined) {
      const first = typeof body.firstName === "string" ? body.firstName.trim() : ""
      if (first.length > 100) return apiError("Имя слишком длинное", 400)
      updates.firstName = first || null
    }
    if (body.lastName !== undefined) {
      const last = typeof body.lastName === "string" ? body.lastName.trim() : ""
      if (last.length > 100) return apiError("Фамилия слишком длинная", 400)
      updates.lastName = last || null
    }
    // Если оба поля заданы в этом запросе — обновляем name для совместимости.
    {
      const first = updates.firstName !== undefined
        ? (updates.firstName as string | null)
        : undefined
      const last = updates.lastName !== undefined
        ? (updates.lastName as string | null)
        : undefined
      if (first !== undefined && last !== undefined && (first || last)) {
        updates.name = [first, last].filter(Boolean).join(" ")
      }
    }

    // ── newEmail ───────────────────────────────────────────
    // Директор/owner компании не может менять email напрямую — только
    // через запрос платформенному админу (/api/support/requests, type=email_change).
    // Остальные роли (hr_*, department_head, observer) меняют сами.
    if (body.newEmail !== undefined) {
      if (session.role === "director") {
        return apiError("Директор может менять email только через запрос администратору", 403)
      }
      const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : ""
      if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return apiError("Некорректный email", 400)
      }
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, newEmail))
        .limit(1)
      if (conflict && conflict.id !== session.id) {
        return apiError("Этот email уже занят", 409)
      }
      updates.email = newEmail
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
