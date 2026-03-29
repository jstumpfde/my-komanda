import { eq, and, inArray, count, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantModules, modules, vacancies, candidates, users } from "@/lib/db/schema"

// Слаги HR-модулей — включаем все возможные варианты написания (seed.ts vs registry.ts)
export const HR_MODULE_SLUGS = [
  "recruiting", "hr-ops", "talent-pool", // стандартные слаги из seed.ts
  "hr", "hr_ops", "talent_pool",          // альтернативные формы на случай расхождения
]

// Вспомогательная проверка: is_active = true ИЛИ NULL (null = не отключён явно)
const isActiveOrNull = or(eq(tenantModules.isActive, true), isNull(tenantModules.isActive))

// ─── hasModuleAccess ──────────────────────────────────────────────────────────

/** Проверяет, подключён ли модуль (по slug) у тенанта и активен */
export async function hasModuleAccess(
  tenantId: string,
  moduleSlug: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: tenantModules.id })
      .from(tenantModules)
      .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
      .where(
        and(
          eq(tenantModules.tenantId, tenantId),
          eq(modules.slug, moduleSlug),
          isActiveOrNull,
        ),
      )
      .limit(1)
    return !!row
  } catch {
    return false
  }
}

/** Проверяет, есть ли у тенанта хотя бы один активный модуль из списка.
 *
 * Алгоритм с двойным fallback:
 * 1. JOIN с modules → фильтр по slug — стандартный путь.
 * 2. Если ничего не нашли — проверяем есть ли ВООБЩЕ активные tenant_modules.
 *    Это покрывает случай, когда module_id в tenant_modules устарел (пересев БД)
 *    или slugs в modules изменились, но записи в tenant_modules живые.
 *    (Все тарифы включают recruiting, поэтому ANY active module ≈ HR access.)
 */
export async function hasAnyModule(
  tenantId: string,
  slugs: string[],
): Promise<boolean> {
  if (slugs.length === 0) return false
  try {
    // ── Шаг 1: JOIN-запрос по slug ────────────────────────────────────────────
    const [bySlug] = await db
      .select({ id: tenantModules.id })
      .from(tenantModules)
      .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
      .where(
        and(
          eq(tenantModules.tenantId, tenantId),
          inArray(modules.slug, slugs),
          isActiveOrNull,
        ),
      )
      .limit(1)
    if (bySlug) return true

    // ── Шаг 2: Fallback — есть хоть один активный модуль? ────────────────────
    // Все тарифы (Solo → Pro) содержат "recruiting", поэтому если у компании
    // есть хоть один модуль — значит есть и HR-доступ.
    const [anyActive] = await db
      .select({ id: tenantModules.id })
      .from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenantId), isActiveOrNull))
      .limit(1)
    return !!anyActive
  } catch {
    return false
  }
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
