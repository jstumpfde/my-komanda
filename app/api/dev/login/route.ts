import { NextResponse } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies, plans, planModules, tenantModules } from "@/lib/db/schema"

// POST /api/dev/login — только в development или при ALLOW_DEV_LOGIN=true
// Возвращает userId первого активного пользователя с компанией.
// Применяет тариф "pro" + все модули ко ВСЕМ компаниям в БД.
const isDevAllowed =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_LOGIN === "true" ||
  process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true"

export async function POST() {
  if (!isDevAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Получаем план "pro" и его модули
  const [proPlan] = await db.select({ id: plans.id }).from(plans)
    .where(eq(plans.slug, "pro")).limit(1)

  const proModules = proPlan
    ? await db.select().from(planModules).where(eq(planModules.planId, proPlan.id))
    : []

  // Применяем pro план + модули ко всем компаниям
  const allCompanies = await db.select({ id: companies.id }).from(companies)
  for (const company of allCompanies) {
    if (proPlan) {
      await db.update(companies)
        .set({ planId: proPlan.id, subscriptionStatus: "active" })
        .where(eq(companies.id, company.id))

      for (const pm of proModules) {
        await db.insert(tenantModules)
          .values({
            tenantId:      company.id,
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
              isActive:    true,
              activatedAt: new Date(),
              maxVacancies:  pm.maxVacancies,
              maxCandidates: pm.maxCandidates,
              maxEmployees:  pm.maxEmployees,
              maxScenarios:  pm.maxScenarios,
              maxUsers:      pm.maxUsers,
            },
          })
      }
    }
  }

  // Ищем первого активного пользователя с company_id
  const [withCompany] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.companyId)))
    .limit(1)

  if (withCompany) return NextResponse.json({ userId: withCompany.id })

  // Нет пользователя с компанией — создаём демо
  const [firstCompany] = await db.select({ id: companies.id }).from(companies).limit(1)
  const companyId = firstCompany?.id ?? (await db
    .insert(companies).values({ name: "Демо Компания" })
    .returning({ id: companies.id }))[0].id

  const [firstUser] = await db.select({ id: users.id }).from(users)
    .where(eq(users.isActive, true)).limit(1)

  if (firstUser) {
    await db.update(users).set({ companyId, role: "admin" }).where(eq(users.id, firstUser.id))
    return NextResponse.json({ userId: firstUser.id })
  }

  const passwordHash = await bcrypt.hash("demo123", 10)
  const [demo] = await db.insert(users).values({
    email: "demo@mykomanda.ru", name: "Демо Директор",
    role: "admin", passwordHash, isActive: true, companyId,
  }).returning({ id: users.id })

  return NextResponse.json({ userId: demo.id })
}
