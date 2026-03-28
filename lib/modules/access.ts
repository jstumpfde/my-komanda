import { eq, and, inArray, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantModules, modules, vacancies, candidates, users } from "@/lib/db/schema"

// Слаги HR-модулей
export const HR_MODULE_SLUGS = ["recruiting", "hr-ops", "talent-pool"]

// ─── hasModuleAccess ──────────────────────────────────────────────────────────

/** Проверяет, подключён ли модуль (по slug) у тенанта и активен */
export async function hasModuleAccess(
  tenantId: string,
  moduleSlug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantModules.id })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(modules.slug, moduleSlug),
        eq(tenantModules.isActive, true),
      ),
    )
    .limit(1)
  return !!row
}

/** Проверяет, есть ли у тенанта хотя бы один активный модуль из списка */
export async function hasAnyModule(
  tenantId: string,
  slugs: string[],
): Promise<boolean> {
  if (slugs.length === 0) return false
  const [row] = await db
    .select({ id: tenantModules.id })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        inArray(modules.slug, slugs),
        eq(tenantModules.isActive, true),
      ),
    )
    .limit(1)
  return !!row
}

// ─── getTenantModules ─────────────────────────────────────────────────────────

/** Возвращает все активные модули тенанта */
export async function getTenantModules(tenantId: string) {
  return db
    .select({ tm: tenantModules, module: modules })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(tenantModules.isActive, true),
      ),
    )
    .orderBy(modules.sortOrder)
}

// ─── checkModuleLimit ─────────────────────────────────────────────────────────

type Resource = "vacancies" | "candidates" | "employees" | "users"

/**
 * Проверяет лимит ресурса для модуля тенанта.
 * Возвращает { allowed, used, limit } где limit=null означает безлимит.
 */
export async function checkModuleLimit(
  tenantId: string,
  moduleSlug: string,
  resource: Resource,
): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  const [row] = await db
    .select({ tm: tenantModules })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(modules.slug, moduleSlug),
        eq(tenantModules.isActive, true),
      ),
    )
    .limit(1)

  if (!row) return { allowed: false, used: 0, limit: 0 }

  const limitMap: Record<Resource, number | null> = {
    vacancies:  row.tm.maxVacancies  ?? null,
    candidates: row.tm.maxCandidates ?? null,
    employees:  row.tm.maxEmployees  ?? null,
    users:      row.tm.maxUsers      ?? null,
  }
  const limit = limitMap[resource]

  // Считаем текущее использование
  let used = 0
  if (resource === "vacancies") {
    const [r] = await db
      .select({ c: count() })
      .from(vacancies)
      .where(eq(vacancies.companyId, tenantId))
    used = r?.c ?? 0
  } else if (resource === "candidates") {
    const [r] = await db
      .select({ c: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(vacancies.companyId, tenantId))
    used = r?.c ?? 0
  } else if (resource === "users") {
    const [r] = await db
      .select({ c: count() })
      .from(users)
      .where(eq(users.companyId, tenantId))
    used = r?.c ?? 0
  }
  // employees — таблица пока не создана, возвращаем 0

  const allowed = limit === null || used < limit
  return { allowed, used, limit }
}
