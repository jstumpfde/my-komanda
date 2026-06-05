import { eq, and, isNull } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const ALLOWED_ROLES = new Set(["director", "hr_lead", "hr_manager", "department_head", "observer", "employee"])

function generateTempPassword(): string {
  // 12 символов: буквы (без 1,l,I,0,O,o) + цифры — компактно и читаемо
  // на бумаге при передаче админом сотруднику.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        position: users.position,
        avatarUrl: users.avatarUrl,
        permissions: users.permissions,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.companyId, user.companyId), isNull(users.deletedAt)))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/team — добавить участника вручную (без email-приглашения).
// Возвращает временный пароль один раз, дальше уже не отдаётся.
export async function POST(req: Request) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as {
      name?: string
      email?: string
      role?: string
      avatarUrl?: string | null
    }

    const name = (body.name ?? "").trim()
    const email = (body.email ?? "").trim().toLowerCase()
    const role = (body.role ?? "").trim()

    if (!name) return apiError("Имя обязательно", 400)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError("Некорректный email", 400)
    if (!ALLOWED_ROLES.has(role)) return apiError("Недопустимая роль", 400)

    // Уникальность email на уровне users (unique constraint в schema).
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing) return apiError("Пользователь с таким email уже существует", 409)

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const [created] = await db.insert(users).values({
      name,
      email,
      passwordHash,
      role,
      companyId: user.companyId,
      avatarUrl: body.avatarUrl ?? null,
      isActive: true,
    }).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
    })

    return apiSuccess({ ...created, tempPassword })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /api/team]", err)
    return apiError("Не удалось добавить участника", 500)
  }
}

// PATCH /api/team — обновить участника (роль / права / статус активности).
// Раньше эти правки жили только в локальном стейте страницы и терялись при
// перезагрузке — теперь персистятся в БД.
export async function PATCH(req: Request) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as {
      id?: string
      role?: string
      permissions?: Record<string, boolean>
      isActive?: boolean
    }

    const id = (body.id ?? "").trim()
    if (!id) return apiError("id обязателен", 400)

    // Тенант-гард: участник должен принадлежать той же компании.
    const [target] = await db
      .select({ id: users.id, companyId: users.companyId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!target || target.companyId !== user.companyId) return apiError("Участник не найден", 404)

    const patch: Record<string, unknown> = {}
    if (body.role !== undefined) {
      if (!ALLOWED_ROLES.has(body.role)) return apiError("Недопустимая роль", 400)
      if (id === user.id && body.role !== "director") return apiError("Нельзя понизить собственную роль директора", 400)
      patch.role = body.role
    }
    if (body.permissions !== undefined && body.permissions !== null && typeof body.permissions === "object") {
      patch.permissions = body.permissions
    }
    if (body.isActive !== undefined) {
      if (id === user.id && body.isActive === false) return apiError("Нельзя заблокировать самого себя", 400)
      patch.isActive = !!body.isActive
    }
    if (Object.keys(patch).length === 0) return apiError("Нет полей для обновления", 400)

    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      permissions: users.permissions,
      isActive: users.isActive,
      avatarUrl: users.avatarUrl,
    })

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PATCH /api/team]", err)
    return apiError("Не удалось сохранить участника", 500)
  }
}

// DELETE /api/team?id=... — мягкое удаление участника из команды
// (deletedAt + isActive=false). FK не трогаем, в списке (GET) такие скрыты.
export async function DELETE(req: Request) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get("id") ?? "").trim()
    if (!id) return apiError("id обязателен", 400)
    if (id === user.id) return apiError("Нельзя удалить самого себя", 400)

    const [target] = await db
      .select({ id: users.id, companyId: users.companyId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!target || target.companyId !== user.companyId) return apiError("Участник не найден", 404)

    await db.update(users).set({ deletedAt: new Date(), isActive: false }).where(eq(users.id, id))
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[DELETE /api/team]", err)
    return apiError("Не удалось удалить участника", 500)
  }
}
