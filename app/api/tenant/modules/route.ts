import { eq, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantModules, modules, vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/tenant/modules — активные модули текущего тенанта + usage
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({ tm: tenantModules, module: modules })
      .from(tenantModules)
      .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
      .where(eq(tenantModules.tenantId, user.companyId))
      .orderBy(modules.sortOrder)

    // Usage: количество вакансий и кандидатов компании
    const [vacancyCount] = await db
      .select({ value: count() })
      .from(vacancies)
      .where(eq(vacancies.companyId, user.companyId))

    const [candidateCount] = await db
      .select({ value: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, user.companyId))

    const usedVacancies  = vacancyCount?.value  ?? 0
    const usedCandidates = candidateCount?.value ?? 0

    const result = rows.map(({ tm, module: mod }) => ({
      id:           tm.id,
      moduleId:     tm.moduleId,
      slug:         mod.slug,
      name:         mod.name,
      icon:         mod.icon,
      isActive:     tm.isActive,
      activatedAt:  tm.activatedAt,
      expiresAt:    tm.expiresAt,
      limits: {
        maxVacancies:  tm.maxVacancies,
        maxCandidates: tm.maxCandidates,
        maxEmployees:  tm.maxEmployees,
        maxScenarios:  tm.maxScenarios,
        maxUsers:      tm.maxUsers,
      },
      usage: {
        vacancies:  usedVacancies,
        candidates: usedCandidates,
      },
    }))

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[api/tenant/modules GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
