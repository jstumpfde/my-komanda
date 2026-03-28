import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans, planModules, modules } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/plans — публичные тарифы с вложенными модулями и лимитами
export async function GET() {
  try {
    const rows = await db
      .select({
        plan:   plans,
        pm:     planModules,
        module: modules,
      })
      .from(plans)
      .leftJoin(planModules, eq(planModules.planId, plans.id))
      .leftJoin(modules, eq(modules.id, planModules.moduleId))
      .where(eq(plans.isPublic, true))
      .orderBy(plans.sortOrder, modules.sortOrder)

    // Группируем по плану
    const planMap = new Map<string, {
      id: string; slug: string; name: string; price: number
      currency: string | null; interval: string | null; sortOrder: number | null
      modules: { id: string; slug: string; name: string; icon: string | null
                 maxVacancies: number | null; maxCandidates: number | null
                 maxEmployees: number | null; maxScenarios: number | null
                 maxUsers: number | null }[]
    }>()

    for (const { plan, pm, module: mod } of rows) {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, {
          id: plan.id, slug: plan.slug, name: plan.name, price: plan.price,
          currency: plan.currency, interval: plan.interval, sortOrder: plan.sortOrder,
          modules: [],
        })
      }
      if (mod && pm) {
        planMap.get(plan.id)!.modules.push({
          id: mod.id, slug: mod.slug, name: mod.name, icon: mod.icon,
          maxVacancies: pm.maxVacancies, maxCandidates: pm.maxCandidates,
          maxEmployees: pm.maxEmployees, maxScenarios: pm.maxScenarios,
          maxUsers: pm.maxUsers,
        })
      }
    }

    return apiSuccess([...planMap.values()])
  } catch (err) {
    console.error("[api/plans GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
