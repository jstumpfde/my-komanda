import { eq, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans, planModules, modules, companies } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/plans — все тарифы с модулями и кол-вом клиентов
export async function GET() {
  try {
    await requirePlatformAdmin()

    const rows = await db
      .select({ plan: plans, pm: planModules, module: modules })
      .from(plans)
      .leftJoin(planModules, eq(planModules.planId, plans.id))
      .leftJoin(modules, eq(modules.id, planModules.moduleId))
      .orderBy(plans.sortOrder, modules.sortOrder)

    // Кол-во клиентов на каждом тарифе
    const clientCounts = await db
      .select({ planId: companies.planId, cnt: count() })
      .from(companies)
      .groupBy(companies.planId)

    const countMap = new Map(clientCounts.map(r => [r.planId, r.cnt]))

    const planMap = new Map<string, {
      id: string; slug: string; name: string; price: number
      currency: string | null; interval: string | null; isPublic: boolean | null
      sortOrder: number | null; clientCount: number
      modules: { id: string; slug: string; name: string; icon: string | null }[]
    }>()

    for (const { plan, pm, module: mod } of rows) {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, {
          id: plan.id, slug: plan.slug, name: plan.name, price: plan.price,
          currency: plan.currency, interval: plan.interval, isPublic: plan.isPublic,
          sortOrder: plan.sortOrder,
          clientCount: countMap.get(plan.id) ?? 0,
          modules: [],
        })
      }
      if (mod && pm) {
        planMap.get(plan.id)!.modules.push({ id: mod.id, slug: mod.slug, name: mod.name, icon: mod.icon })
      }
    }

    return apiSuccess([...planMap.values()])
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
