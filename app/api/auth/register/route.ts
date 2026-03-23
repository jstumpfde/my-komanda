import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      email?: unknown
      password?: unknown
      name?: unknown
    }

    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase()
    const password = typeof body.password === "string" ? body.password : ""
    const name = (typeof body.name === "string" ? body.name : "").trim()

    // Validate required fields
    if (!email || !password || !name) {
      return apiError("Все поля обязательны", 400)
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("Некорректный формат email", 400)
    }

    if (password.length < 6) {
      return apiError("Пароль должен содержать минимум 6 символов", 400)
    }

    // Check email uniqueness
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing) {
      return apiError("Email уже используется", 409)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        role: "client",
        isActive: true,
        companyId: null,
      })
      .returning({ id: users.id })

    return apiSuccess({ success: true, userId: user.id }, 201)
  } catch (err) {
    console.error("[register] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
