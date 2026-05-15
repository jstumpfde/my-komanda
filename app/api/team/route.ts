import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const ALLOWED_ROLES = new Set(["director", "hr_manager", "department_head", "observer"])

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
      })
      .from(users)
      .where(eq(users.companyId, user.companyId))

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
