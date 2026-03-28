import { NextResponse } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies, plans, planModules, tenantModules } from "@/lib/db/schema"

// POST /api/dev/login — только в development
// Находит или создаёт юзера с company_id, назначает тариф "pro" и все модули
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 1. Ищем активного пользователя с companyId
  const [withCompany] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.companyId)))
    .limit(1)

  const userId = withCompany?.id ?? await (async () => {
    // Берём первую компанию или создаём демо
    const [company] = await db.select({ id: companies.id }).from(companies).limit(1)
    const companyId = company?.id ?? (await db
      .insert(companies).values({ name: "Демо Компания" })
      .returning({ id: companies.id }))[0].id

    // Берём первого активного пользователя или создаём демо
    const [firstUser] = await db.select({ id: users.id }).from(users)
      .where(eq(users.isActive, true)).limit(1)

    if (firstUser) {
      await db.update(users).set({ companyId, role: "admin" }).where(eq(users.id, firstUser.id))
      return firstUser.id
    }

    const passwordHash = await bcrypt.hash("demo123", 10)
    const [demo] = await db.insert(users).values({
      email: "demo@mykomanda.ru", name: "Демо Директор",
      role: "admin", passwordHash, isActive: true, companyId,
    }).returning({ id: users.id })
    return demo.id
  })()

  // Определяем companyId текущего пользователя
  const [currentUser] = await db
    .select({ companyId: users.companyId })
    .from(users).where(eq(users.id, userId)).limit(1)
  const companyId = currentUser?.companyId!

  // 2. Назначаем тариф "pro" компании
  const [proPlan] = await db.select({ id: plans.id }).from(plans)
    .where(eq(plans.slug, "pro")).limit(1)

  if (proPlan) {
    await db.update(companies)
      .set({ planId: proPlan.id, subscriptionStatus: "active" })
      .where(eq(companies.id, companyId))

    // 3. Активируем все модули тарифа "pro" для демо-компании
    const proModules = await db.select().from(planModules)
      .where(eq(planModules.planId, proPlan.id))

    for (const pm of proModules) {
      await db.insert(tenantModules)
        .values({
          tenantId:      companyId,
          moduleId:      pm.moduleId,
          isActive:      true,
          activatedAt:   new Date(),
          maxVacancies:  pm.maxVacancies,
          maxCandidates: pm.maxCandidates,
          maxEmployees:  pm.maxEmployees,
          maxScenarios:  pm.maxScenarios,
          maxUsers:      pm.maxUsers,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: {
            isActive:      true,
            activatedAt:   new Date(),
            maxVacancies:  pm.maxVacancies,
            maxCandidates: pm.maxCandidates,
            maxEmployees:  pm.maxEmployees,
            maxScenarios:  pm.maxScenarios,
            maxUsers:      pm.maxUsers,
          },
        })
    }
  }

  return NextResponse.json({ userId })
}
