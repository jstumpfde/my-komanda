import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { accessRequests, companies, users } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// Временный пароль директора — оператор передаёт клиенту, тот меняет при входе.
// Без неоднозначных символов (0/O, 1/l). Та же логика, что в lib/partner/onboard.ts.
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let s = ""
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// POST /api/admin/access-requests/[id]/approve
//
// Одобрить заявку на регистрацию: создать компанию + директора-логин,
// пометить заявку approved. Возвращает креды (email + временный пароль)
// для выдачи клиенту. Идемпотентно по статусу: повтор после approved → 400.
// Если email уже занят пользователем → 409, заявка НЕ одобряется.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return apiError("Unauthorized", 401)
  }

  const { id } = await params

  try {
    const [reqRow] = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.id, id))
      .limit(1)
    if (!reqRow) return apiError("Заявка не найдена", 404)
    if (reqRow.status === "approved") {
      return apiError("Заявка уже одобрена", 400)
    }
    if (reqRow.status === "rejected") {
      return apiError("Заявка отклонена — одобрить нельзя", 400)
    }

    const email = (reqRow.email ?? "").trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("В заявке нет валидного email", 400)
    }
    const companyName = (reqRow.companyName ?? reqRow.name ?? "").trim()
    if (!companyName) return apiError("В заявке нет названия компании", 400)

    // Идемпотентность: email уже зарегистрирован — не создаём дубль, не одобряем.
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (existingUser) {
      return apiError("Пользователь с таким email уже существует", 409)
    }

    const tempPassword = genPassword()
    const passwordHash = bcrypt.hashSync(tempPassword, 10)

    const { companyId } = await db.transaction(async (tx) => {
      // 1. Компания (NOT NULL-поля берут дефолты схемы).
      const [company] = await tx
        .insert(companies)
        .values({ name: companyName })
        .returning({ id: companies.id })

      // 2. Директор-логин.
      await tx.insert(users).values({
        email,
        name: (reqRow.name ?? companyName).trim() || companyName,
        passwordHash,
        role: "director",
        companyId: company.id,
      })

      // 3. Помечаем заявку одобренной.
      await tx
        .update(accessRequests)
        .set({ status: "approved" })
        .where(eq(accessRequests.id, id))

      return { companyId: company.id }
    })

    return apiSuccess({ companyId, directorEmail: email, tempPassword })
  } catch (err) {
    console.error("[admin/access-requests approve]", err)
    return apiError("Internal server error", 500)
  }
}
