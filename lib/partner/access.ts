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
}

// Требует роль partner + наличие записи integrators у его компании.
export async function requirePartner(): Promise<PartnerContext> {
  const user = await requireAuth()
  if (!isPartnerRole(user.role as UserRole)) {
    throw apiError("Доступ только для партнёров", 403)
  }
  if (!user.companyId) {
    throw apiError("Партнёрский аккаунт не привязан к компании", 403)
  }
  const [integrator] = await db
    .select()
    .from(integrators)
    .where(eq(integrators.companyId, user.companyId))
    .limit(1)
  if (!integrator) {
    throw apiError("Партнёрский аккаунт не найден", 404)
  }
  if (integrator.status !== "active") {
    throw apiError("Партнёрский аккаунт неактивен", 403)
  }
  return { user, integrator }
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
