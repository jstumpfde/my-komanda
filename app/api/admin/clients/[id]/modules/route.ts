import { NextRequest } from "next/server"
import { eq, count } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies, modules, plans, planModules,
  tenantModules, vacancies, candidates, users,
} from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

// Цвета модулей по slug
const MODULE_COLORS: Record<string, string> = {
  hr:        "blue",
  marketing: "purple",
  sales:     "emerald",
  logistics: "orange",
}

// GET /api/admin/clients/[id]/modules
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const role = user.role as string
    if (role !== "platform_admin" && role !== "platform_manager" && role !== "admin") {
      return apiError("Доступ запрещён", 403)
    }

    const { id: companyId } = await params

    // Проверяем что компания существует
    const [company] = await db
      .select({ id: companies.id, planId: companies.planId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company) return apiError("Клиент не найден", 404)

    // Все модули
    const allModules = await db
      .select()
      .from(modules)
      .orderBy(modules.sortOrder)

    // Активированные у клиента модули
    const tenantModuleRows = await db
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, companyId))

    const tmMap = new Map(tenantModuleRows.map(tm => [tm.moduleId, tm]))

    // Тарифы для plan_modules join
    const allPlans = await db
      .select({ id: plans.id, name: plans.name, slug: plans.slug })
      .from(plans)
      .orderBy(plans.sortOrder)

    const planMap = new Map(allPlans.map(p => [p.id, p]))

    // plan_modules — лимиты по тарифу
    let planModuleRows: { moduleId: string; planId: string; maxVacancies: number | null; maxCandidates: number | null; maxEmployees: number | null; limits: unknown }[] = []
    if (company.planId) {
      planModuleRows = await db
        .select({
          moduleId:     planModules.moduleId,
          planId:       planModules.planId,
          maxVacancies: planModules.maxVacancies,
          maxCandidates: planModules.maxCandidates,
          maxEmployees: planModules.maxEmployees,
          limits:       planModules.limits,
        })
        .from(planModules)
        .where(eq(planModules.planId, company.planId))
    }
    const pmMap = new Map(planModuleRows.map(pm => [pm.moduleId, pm]))

    // Использование: вакансии, кандидаты, пользователи (общий счётчик тенанта)
    const [{ vacancyCount }] = await db
      .select({ vacancyCount: count() })
      .from(vacancies)
      .where(eq(vacancies.companyId, companyId))

    const [{ candidateCount }] = await db
      .select({ candidateCount: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, companyId))

    const [{ employeeCount }] = await db
      .select({ employeeCount: count() })
      .from(users)
      .where(eq(users.companyId, companyId))

    const result = allModules.map(mod => {
      const tm = tmMap.get(mod.id)
      const pm = pmMap.get(mod.id)
      const plan = pm ? planMap.get(pm.planId) : null

      return {
        moduleId:       mod.id,
        moduleSlug:     mod.slug,
        moduleName:     mod.name,
        color:          MODULE_COLORS[mod.slug] ?? "gray",
        enabled:        tm?.isActive ?? false,
        tenantModuleId: tm?.id ?? null,
        planId:         pm?.planId ?? null,
        planName:       plan?.name ?? null,
        customLimits:   (tm as Record<string, unknown> | undefined)?.customLimits ?? null,
        limits: pm
          ? {
              max_vacancies:  pm.maxVacancies,
              max_candidates: pm.maxCandidates,
              max_employees:  pm.maxEmployees,
              ...(pm.limits as object ?? {}),
            }
          : null,
        usage: {
          vacancies:  vacancyCount,
          candidates: candidateCount,
          employees:  employeeCount,
        },
      }
    })

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/clients/[id]/modules GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PATCH /api/admin/clients/[id]/modules
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const role = user.role as string
    if (role !== "platform_admin" && role !== "platform_manager" && role !== "admin") {
      return apiError("Доступ запрещён", 403)
    }

    const { id: companyId } = await params
    const body = await req.json() as {
      tenantModuleId?: string
      moduleId?: string
      enabled?: boolean
      planId?: string
      customLimits?: Record<string, number | null>
    }

    // Resolve the tenantModules record
    let tmRow: { id: string; tenantId: string; moduleId: string } | undefined

    if (body.tenantModuleId) {
      const [found] = await db
        .select({ id: tenantModules.id, tenantId: tenantModules.tenantId, moduleId: tenantModules.moduleId })
        .from(tenantModules)
        .where(eq(tenantModules.id, body.tenantModuleId))
        .limit(1)
      tmRow = found
    } else if (body.moduleId) {
      const [found] = await db
        .select({ id: tenantModules.id, tenantId: tenantModules.tenantId, moduleId: tenantModules.moduleId })
        .from(tenantModules)
        .where(eq(tenantModules.tenantId, companyId))
        .limit(1)
      tmRow = found
    }

    const now = new Date()

    if (tmRow) {
      // Update existing record
      const updateData: Record<string, unknown> = {}

      if (body.enabled !== undefined) {
        updateData.isActive = body.enabled
        if (body.enabled) {
          updateData.enabledAt = now
          updateData.disabledAt = null
        } else {
          updateData.disabledAt = now
        }
      }

      if (body.customLimits !== undefined) {
        updateData.customLimits = body.customLimits
      }

      await db
        .update(tenantModules)
        .set(updateData)
        .where(eq(tenantModules.id, tmRow.id))

      return apiSuccess({ updated: true, tenantModuleId: tmRow.id })
    } else if (body.moduleId && body.enabled) {
      // Insert new tenant module row
      const [inserted] = await db
        .insert(tenantModules)
        .values({
          tenantId:     companyId,
          moduleId:     body.moduleId,
          isActive:     true,
          activatedAt:  now,
          enabledAt:    now,
          customLimits: body.customLimits ?? null,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: {
            isActive:     true,
            activatedAt:  now,
            enabledAt:    now,
            customLimits: body.customLimits ?? null,
          },
        })
        .returning({ id: tenantModules.id })

      return apiSuccess({ updated: true, tenantModuleId: inserted.id })
    }

    return apiError("Запись модуля не найдена. Передайте tenantModuleId или moduleId", 404)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/clients/[id]/modules PATCH]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
