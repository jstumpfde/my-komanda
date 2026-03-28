import { NextResponse } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"

// POST /api/dev/login — только в development
// Находит или создаёт юзера с company_id, чтобы после входа попасть на /overview
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 1. Ищем активного пользователя, у которого уже есть companyId
  const [withCompany] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.companyId)))
    .limit(1)

  if (withCompany) return NextResponse.json({ userId: withCompany.id })

  // 2. Берём первую компанию из БД (или создаём демо)
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .limit(1)

  const companyId = company?.id ?? await (async () => {
    const [c] = await db
      .insert(companies)
      .values({ name: "Демо Компания" })
      .returning({ id: companies.id })
    return c.id
  })()

  // 3. Берём первого активного пользователя и назначаем ему компанию
  const [firstUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isActive, true))
    .limit(1)

  if (firstUser) {
    await db
      .update(users)
      .set({ companyId, role: "director" })
      .where(eq(users.id, firstUser.id))
    return NextResponse.json({ userId: firstUser.id })
  }

  // 4. Создаём демо-пользователя с компанией
  const passwordHash = await bcrypt.hash("demo123", 10)
  const [demo] = await db
    .insert(users)
    .values({
      email: "demo@mykomanda.ru",
      name: "Демо Директор",
      role: "director",
      passwordHash,
      isActive: true,
      companyId,
    })
    .returning({ id: users.id })

  return NextResponse.json({ userId: demo.id })
}
