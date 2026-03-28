import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

// POST /api/dev/login — только в development: вернуть id первого юзера (или создать демо)
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Берём первого активного пользователя
  const [first] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isActive, true))
    .limit(1)

  if (first) return NextResponse.json({ userId: first.id })

  // Создаём демо-пользователя
  const passwordHash = await bcrypt.hash("demo123", 10)
  const [demo] = await db
    .insert(users)
    .values({
      email: "demo@mykomanda.ru",
      name: "Демо Директор",
      role: "director",
      passwordHash,
      isActive: true,
    })
    .returning({ id: users.id })

  return NextResponse.json({ userId: demo.id })
}
