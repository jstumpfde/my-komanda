import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans, planModules, modules } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/plans/[planId] — тариф со всеми модулями (isIncluded + лимиты)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { planId } = await params

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    if (!plan) return apiError("Тариф не найден", 404)

    const allModules = await db.select().from(modules).orderBy(modules.sortOrder)
    const planModuleRows = await db.select().from(planModules).where(eq(planModules.planId, planId))
    const pmMap = new Map(planModuleRows.map(pm => [pm.moduleId, pm]))

    const modulesWithState = allModules.map(mod => {
      const pm = pmMap.get(mod.id)
      return {
        id: mod.id, slug: mod.slug, name: mod.name, icon: mod.icon, sortOrder: mod.sortOrder,
        isIncluded:    !!pm,
        maxVacancies:  pm?.maxVacancies  ?? null,
        maxCandidates: pm?.maxCandidates ?? null,
        maxEmployees:  pm?.maxEmployees  ?? null,
        maxScenarios:  pm?.maxScenarios  ?? null,
        maxUsers:      pm?.maxUsers      ?? null,
      }
    })

    return apiSuccess({ plan, modules: modulesWithState })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans/[planId] GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PUT /api/admin/plans/[planId] — обновить тариф и его модули
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { planId } = await params

    const body = await req.json() as {
      name: string; slug: string; price: number; interval: string; isPublic: boolean
      modules: { moduleId: string; isIncluded: boolean
                 maxVacancies?: number | null; maxCandidates?: number | null
                 maxEmployees?: number | null; maxScenarios?: number | null
                 maxUsers?: number | null }[]
    }

    const { name, slug, price, interval, isPublic, modules: moduleUpdates } = body

    await db.update(plans)
      .set({ name, slug, price, interval, isPublic })
      .where(eq(plans.id, planId))

    for (const m of moduleUpdates ?? []) {
      if (m.isIncluded) {
        await db.insert(planModules)
          .values({
            planId,
            moduleId:      m.moduleId,
            maxVacancies:  m.maxVacancies  ?? null,
            maxCandidates: m.maxCandidates ?? null,
            maxEmployees:  m.maxEmployees  ?? null,
            maxScenarios:  m.maxScenarios  ?? null,
            maxUsers:      m.maxUsers      ?? null,
          })
          .onConflictDoUpdate({
            target: [planModules.planId, planModules.moduleId],
            set: {
              maxVacancies:  m.maxVacancies  ?? null,
              maxCandidates: m.maxCandidates ?? null,
              maxEmployees:  m.maxEmployees  ?? null,
              maxScenarios:  m.maxScenarios  ?? null,
              maxUsers:      m.maxUsers      ?? null,
            },
          })
      } else {
        await db.delete(planModules).where(
          and(eq(planModules.planId, planId), eq(planModules.moduleId, m.moduleId))
        )
      }
    }

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans/[planId] PUT]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PATCH /api/admin/plans/[planId] — частичное обновление (archiving, trialDays)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { planId } = await params
    const body = await req.json() as {
      isArchived?: boolean
      trialDays?: number
    }

    const updateData: Record<string, unknown> = {}
    if (body.isArchived !== undefined) {
      updateData.isArchived = body.isArchived
      if (body.isArchived) updateData.archivedAt = new Date()
      else updateData.archivedAt = null
    }
    if (body.trialDays !== undefined) {
      updateData.trialDays = body.trialDays
    }

    const [updated] = await db
      .update(plans)
      .set(updateData)
      .where(eq(plans.id, planId))
      .returning()

    if (!updated) return apiError("Тариф не найден", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans/[planId] PATCH]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
