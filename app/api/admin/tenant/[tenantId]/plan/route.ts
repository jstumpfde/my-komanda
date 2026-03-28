import { NextRequest } from "next/server"
import { eq, and, inArray, notInArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, plans, planModules, tenantModules } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// PUT /api/admin/tenant/[tenantId]/plan — сменить тариф клиента
// Обновляет planId на компании и синхронизирует tenant_modules согласно плану
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { tenantId } = await params

    const body = await req.json() as { planId: string }
    const { planId } = body

    if (!planId) return apiError("planId обязателен", 400)

    // Проверяем план
    const [plan] = await db
      .select({ id: plans.id, slug: plans.slug })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1)

    if (!plan) return apiError("Тариф не найден", 404)

    // Получаем модули нового плана с лимитами
    const newPlanModules = await db
      .select({ pm: planModules })
      .from(planModules)
      .where(eq(planModules.planId, planId))

    const planModuleIds = newPlanModules.map(({ pm }) => pm.moduleId)

    // Обновляем planId у компании
    await db
      .update(companies)
      .set({ planId })
      .where(eq(companies.id, tenantId))

    // Активируем/обновляем модули из нового плана
    if (planModuleIds.length > 0) {
      for (const { pm } of newPlanModules) {
        await db
          .insert(tenantModules)
          .values({
            tenantId,
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

      // Деактивируем модули, которых нет в новом плане
      await db
        .update(tenantModules)
        .set({ isActive: false })
        .where(
          and(
            eq(tenantModules.tenantId, tenantId),
            notInArray(tenantModules.moduleId, planModuleIds),
          )
        )
    } else {
      // Новый план без модулей — деактивируем все
      await db
        .update(tenantModules)
        .set({ isActive: false })
        .where(eq(tenantModules.tenantId, tenantId))
    }

    return apiSuccess({ tenantId, planId, planSlug: plan.slug, modulesActivated: planModuleIds.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/tenant/plan PUT]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
