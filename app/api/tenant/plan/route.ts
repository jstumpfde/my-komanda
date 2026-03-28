import { NextRequest } from "next/server"
import { eq, count, notInArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, plans, planModules, tenantModules, modules, vacancies, candidates, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/tenant/plan — текущий тариф клиента + модули с лимитами и использованием
export async function GET() {
  try {
    const user = await requireCompany()

    const [company] = await db
      .select({ planId: companies.planId, subscriptionStatus: companies.subscriptionStatus })
      .from(companies).where(eq(companies.id, user.companyId)).limit(1)

    if (!company) return apiError("Компания не найдена", 404)

    const currentPlan = company.planId
      ? (await db.select({ id: plans.id, slug: plans.slug, name: plans.name, price: plans.price })
          .from(plans).where(eq(plans.id, company.planId)).limit(1))[0] ?? null
      : null

    // Все публичные тарифы с модулями (для модалки смены)
    const allPublicPlans = await db
      .select({ id: plans.id, slug: plans.slug, name: plans.name, price: plans.price })
      .from(plans).where(eq(plans.isPublic, true)).orderBy(plans.sortOrder)

    // Активные модули клиента
    const tenantModuleRows = await db
      .select({
        id: modules.id, slug: modules.slug, name: modules.name, icon: modules.icon,
        isActive:      tenantModules.isActive,
        maxVacancies:  tenantModules.maxVacancies,
        maxCandidates: tenantModules.maxCandidates,
        maxEmployees:  tenantModules.maxEmployees,
        maxScenarios:  tenantModules.maxScenarios,
        maxUsers:      tenantModules.maxUsers,
      })
      .from(tenantModules)
      .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
      .where(eq(tenantModules.tenantId, user.companyId))

    // Использование
    const [{ vacancyCount }] = await db
      .select({ vacancyCount: count() }).from(vacancies).where(eq(vacancies.companyId, user.companyId))

    const [{ candidateCount }] = await db
      .select({ candidateCount: count() }).from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, user.companyId))

    const [{ userCount }] = await db
      .select({ userCount: count() }).from(users).where(eq(users.companyId, user.companyId))

    const activeModules = tenantModuleRows
      .filter(m => m.isActive)
      .map(m => ({
        id: m.id, slug: m.slug, name: m.name, icon: m.icon,
        maxVacancies:  m.maxVacancies,
        maxCandidates: m.maxCandidates,
        maxEmployees:  m.maxEmployees,
        maxScenarios:  m.maxScenarios,
        maxUsers:      m.maxUsers,
        usedVacancies:  vacancyCount,
        usedCandidates: candidateCount,
        usedUsers:      userCount,
      }))

    return apiSuccess({
      currentPlan,
      subscriptionStatus: company.subscriptionStatus,
      modules: activeModules,
      allPublicPlans,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[api/tenant/plan GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PUT /api/tenant/plan — самостоятельная смена тарифа клиентом (MVP без оплаты)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { planId } = await req.json() as { planId: string }

    if (!planId) return apiError("planId обязателен", 400)

    const [plan] = await db.select({ id: plans.id, isPublic: plans.isPublic })
      .from(plans).where(eq(plans.id, planId)).limit(1)

    if (!plan) return apiError("Тариф не найден", 404)
    if (!plan.isPublic) return apiError("Тариф недоступен", 403)

    const newPlanModules = await db.select().from(planModules)
      .where(eq(planModules.planId, planId))
    const planModuleIds = newPlanModules.map(pm => pm.moduleId)

    // Обновляем тариф компании
    await db.update(companies)
      .set({ planId, subscriptionStatus: "active" })
      .where(eq(companies.id, user.companyId))

    // Деактивируем модули, которых нет в новом тарифе
    if (planModuleIds.length > 0) {
      await db.update(tenantModules).set({ isActive: false }).where(
        eq(tenantModules.tenantId, user.companyId)
      )
    } else {
      await db.update(tenantModules).set({ isActive: false })
        .where(eq(tenantModules.tenantId, user.companyId))
    }

    // Активируем модули нового тарифа
    for (const pm of newPlanModules) {
      await db.insert(tenantModules)
        .values({
          tenantId: user.companyId, moduleId: pm.moduleId,
          isActive: true, activatedAt: new Date(),
          maxVacancies: pm.maxVacancies, maxCandidates: pm.maxCandidates,
          maxEmployees: pm.maxEmployees, maxScenarios: pm.maxScenarios,
          maxUsers: pm.maxUsers,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: {
            isActive: true, activatedAt: new Date(),
            maxVacancies: pm.maxVacancies, maxCandidates: pm.maxCandidates,
            maxEmployees: pm.maxEmployees, maxScenarios: pm.maxScenarios,
            maxUsers: pm.maxUsers,
          },
        })
    }

    return apiSuccess({ ok: true, planId })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[api/tenant/plan PUT]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
