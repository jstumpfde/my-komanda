// Гейт доступа Партнёрского кабинета (/partner).
//
// Граница безопасности: партнёр видит ТОЛЬКО своих клиентов. Доступ к данным
// клиента идёт через integrator_clients (join), а НЕ через переключение
// session.companyId — иначе партнёр получил бы полный доступ к тенанту клиента.
// См. tenant-isolation: companyId партнёра = его собственная компания-партнёр.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrators, integratorClients } from "@/lib/db/schema"
import { requireAuth, apiError } from "@/lib/api-helpers"
import { isPartnerRole } from "@/lib/roles"
import type { UserRole } from "@/lib/roles"

export interface PartnerContext {
  user: Awaited<ReturnType<typeof requireAuth>>
  integrator: typeof integrators.$inferSelect
  // Тип партнёра: 'partner' | 'sub_partner' | 'referral'. Дубль integrator.kind
  // для удобных гейтов (реферал — view-only). Источник правды — integrators.kind.
  kind: string
}

// Требует роль partner + наличие записи integrators у его компании.
export async function requirePartner(): Promise<PartnerContext> {
  const user = await requireAuth()
  if (!isPartnerRole(user.role as UserRole)) {
    throw apiError("Доступ только для партнёров", 403)
  }
  // Под impersonation session.companyId подменён на клиентскую компанию, поэтому
  // ищем integrator по РЕАЛЬНОЙ компании партнёра (realCompanyId), а в обычном
  // режиме — по companyId. Иначе /partner/* и server-actions входа/выхода
  // сломались бы, когда acting-as активна.
  const partnerCompanyId =
    (user.realCompanyId as string | null | undefined) ?? user.companyId
  if (!partnerCompanyId) {
    throw apiError("Партнёрский аккаунт не привязан к компании", 403)
  }
  const [integrator] = await db
    .select()
    .from(integrators)
    .where(eq(integrators.companyId, partnerCompanyId))
    .limit(1)
  if (!integrator) {
    throw apiError("Партнёрский аккаунт не найден", 404)
  }
  if (integrator.status !== "active") {
    throw apiError("Партнёрский аккаунт неактивен", 403)
  }
  return { user, integrator, kind: integrator.kind }
}

// SECURITY: гейт мутаций кабинета. Реферал — view-only (видит финансы, но НЕ
// управляет: не онбордит, не меняет продукты, не отвязывает, не входит в клиента).
// Бросает 403 для kind='referral'. Вызывать в начале всех мутирующих partner-роутов.
export function assertPartnerCanManage(kind: string): void {
  if (kind === "referral") {
    throw apiError("Реферал не может управлять клиентами — только просмотр финансов", 403)
  }
}

// ID компаний-клиентов данного партнёра (для scoping любых выборок).
export async function getPartnerClientCompanyIds(integratorId: string): Promise<string[]> {
  const rows = await db
    .select({ clientCompanyId: integratorClients.clientCompanyId })
    .from(integratorClients)
    .where(eq(integratorClients.integratorId, integratorId))
  return rows.map((r) => r.clientCompanyId)
}

// Проверка, что компания-клиент действительно принадлежит партнёру (для роутов по [clientId]).
export async function assertPartnerOwnsClient(integratorId: string, clientCompanyId: string): Promise<void> {
  const [row] = await db
    .select({ id: integratorClients.id })
    .from(integratorClients)
    .where(and(
      eq(integratorClients.integratorId, integratorId),
      eq(integratorClients.clientCompanyId, clientCompanyId),
    ))
    .limit(1)
  if (!row) {
    throw apiError("Клиент не найден у этого партнёра", 404)
  }
}
