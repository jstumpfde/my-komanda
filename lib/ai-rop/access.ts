/**
 * Хелперы доступа AI-РОП поверх платформенного auth (см. docs/architecture/
 * AI-ROP-MODULE-PLAN-2026-07.md, решение 3). Замена ca lib/auth.ts::canManage/
 * canViewTeam/SessionUser — здесь роль не хранится в отдельной таблице users
 * модуля, а маппится на платформенные роли/permissions.
 *
 *   ropCanManage    = owner/admin компании (requireDirector-совместимо)
 *   ropCanViewTeam  = ropCanManage ИЛИ role==='department_head' ИЛИ permissions.rop_view_team
 *   ropManagerScope = bitrixManagerId, если пользователь привязан как менеджер
 *                     в rop_managers.userId (иначе null — не сужен/не менеджер)
 */
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropManagers } from "@/lib/db/schema"
import { apiError, requireCompany, requireDirector } from "@/lib/api-helpers"

type CompanyUser = Awaited<ReturnType<typeof requireCompany>>

// Совпадает с DIRECTOR_ROLES в lib/api-helpers.ts (requireDirector) — продублировано
// намеренно, чтобы ropCanManage можно было использовать как чистую функцию (без
// исключений) в местах, где нужен boolean, а не throw.
const DIRECTOR_ROLES = new Set<string>(["director", "client", "platform_admin", "admin"])

export function ropCanManage(user: { role?: unknown; effectiveRole?: unknown }): boolean {
  return DIRECTOR_ROLES.has(user.role as string) || user.effectiveRole === "director"
}

export function ropCanViewTeam(user: {
  role?: unknown
  effectiveRole?: unknown
  permissions?: unknown
}): boolean {
  if (ropCanManage(user)) return true
  if (user.role === "department_head") return true
  const perms = (user.permissions as Record<string, boolean> | null) ?? {}
  return perms["rop_view_team"] === true
}

/**
 * bitrixManagerId, к которому привязан текущий пользователь (rop_managers.userId),
 * или null если не привязан (в т.ч. если у пользователя есть ropCanViewTeam —
 * вызывающая сторона должна СНАЧАЛА проверить ropCanViewTeam и только если false
 * сужать список по этому scope; см. lib/ai-rop/rls.ts).
 */
export async function ropManagerScope(user: { id: string; companyId: string }): Promise<string | null> {
  const [row] = await db
    .select({ bitrixManagerId: ropManagers.bitrixManagerId })
    .from(ropManagers)
    .where(and(eq(ropManagers.tenantId, user.companyId), eq(ropManagers.userId, user.id)))
    .limit(1)
  return row?.bitrixManagerId ?? null
}

/** 401 без сессии/компании, 403 если ни владелец/директор, ни head, ни rop_view_team. */
export async function requireRopTeam(): Promise<CompanyUser> {
  const user = await requireCompany()
  if (!ropCanViewTeam(user)) {
    throw apiError("Доступ к AI-РОП только для руководителей или назначенных пользователей", 403)
  }
  return user
}

/** 401/403 — управление настройками AI-РОП (Bitrix, dry-run, биллинг) только директору. */
export async function requireRopManage(): Promise<CompanyUser> {
  return requireDirector()
}
