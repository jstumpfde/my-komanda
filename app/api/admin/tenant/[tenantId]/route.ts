import { NextRequest } from "next/server"
import { eq, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, plans, modules, tenantModules, vacancies, candidates, users } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/tenant/[tenantId] — карточка клиента: тариф, модули, использование
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { tenantId } = await params

    // Компания
    const [company] = await db
      .select({
        id: companies.id, name: companies.name, inn: companies.inn,
        subscriptionStatus: companies.subscriptionStatus,
        planId: companies.planId, trialEndsAt: companies.trialEndsAt,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(eq(companies.id, tenantId))
      .limit(1)

    if (!company) return apiError("Клиент не найден", 404)

    // Текущий тариф
    const currentPlan = company.planId
      ? (await db.select({ id: plans.id, slug: plans.slug, name: plans.name, price: plans.price })
          .from(plans).where(eq(plans.id, company.planId)).limit(1))[0] ?? null
      : null

    // Все тарифы (для выпадашки)
    const allPlans = await db
      .select({ id: plans.id, slug: plans.slug, name: plans.name, price: plans.price })
      .from(plans)
      .orderBy(plans.sortOrder)

    // Все модули + состояние у клиента
    const allModules = await db.select().from(modules).orderBy(modules.sortOrder)
    const tenantModuleRows = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId))
    const tmMap = new Map(tenantModuleRows.map(tm => [tm.moduleId, tm]))

    // Использование: вакансии, кандидаты, пользователи
    const [{ vacancyCount }] = await db
      .select({ vacancyCount: count() }).from(vacancies).where(eq(vacancies.companyId, tenantId))

    const [{ candidateCount }] = await db
      .select({ candidateCount: count() }).from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, tenantId))

    const [{ userCount }] = await db
      .select({ userCount: count() }).from(users).where(eq(users.companyId, tenantId))

    const modulesWithState = allModules.map(mod => {
      const tm = tmMap.get(mod.id)
      return {
        id: mod.id, slug: mod.slug, name: mod.name, icon: mod.icon,
        isActive:      tm?.isActive ?? false,
        maxVacancies:  tm?.maxVacancies  ?? null,
        maxCandidates: tm?.maxCandidates ?? null,
        maxEmployees:  tm?.maxEmployees  ?? null,
        maxScenarios:  tm?.maxScenarios  ?? null,
        maxUsers:      tm?.maxUsers      ?? null,
        // Использование одинаковое для всех модулей тенанта (общий счётчик)
        usedVacancies:  vacancyCount,
        usedCandidates: candidateCount,
        usedUsers:      userCount,
      }
    })

    return apiSuccess({ company, currentPlan, allPlans, modules: modulesWithState })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/tenant/[tenantId] GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
