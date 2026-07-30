/**
 * Row-Level Security хелперы AI-РОП — собирают WHERE-условия для списков/карточек
 * звонков и напоминаний в зависимости от прав пользователя. Аналог ca lib/rls.ts,
 * переписан под Drizzle + платформенный доступ (lib/ai-rop/access.ts).
 *
 * Принцип:
 *  - tenantId ВСЕГДА обязателен (изоляция компаний — IDOR-инциденты были, критично);
 *  - если пользователь НЕ ropCanViewTeam — дополнительно сужаем по manager_id
 *    (bitrixManagerId из rop_managers.userId); нет привязки → не видит ничего.
 */
import { and, eq, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { ropCalls, ropReminders } from "@/lib/db/schema"

export interface RopScope {
  companyId: string
  /** true — директор/head/rop_view_team: видит всю компанию. false — сужаем по managerCol. */
  isTeamViewer: boolean
  /** bitrixManagerId текущего пользователя (см. ropManagerScope) — null, если не привязан. */
  bitrixManagerId: string | null
}

/**
 * Универсальный билдер: tenantCol = companyId ВСЕГДА; managerCol сравнивается
 * с bitrixManagerId, если scope не team-viewer. Нет привязки → заведомо ложное
 * условие (видит 0 строк), а не «видит всё» — безопасный дефолт.
 */
export function ropScopeWhere(tenantCol: PgColumn, managerCol: PgColumn, scope: RopScope): SQL {
  const base = eq(tenantCol, scope.companyId)
  if (scope.isTeamViewer) return base
  if (!scope.bitrixManagerId) return and(base, sql`1 = 0`)!
  return and(base, eq(managerCol, scope.bitrixManagerId))!
}

/** Готовое условие видимости для rop_calls (WHERE во всех списках/карточках звонков). */
export function ropCallsScope(scope: RopScope): SQL {
  return ropScopeWhere(ropCalls.tenantId, ropCalls.managerId, scope)
}

/** Готовое условие видимости для rop_reminders (сужение по bitrix_manager_id). */
export function ropRemindersScope(scope: RopScope): SQL {
  return ropScopeWhere(ropReminders.tenantId, ropReminders.bitrixManagerId, scope)
}
