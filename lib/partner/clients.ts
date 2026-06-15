// Данные клиентов партнёра для кабинета /partner: подключённые продукты,
// сколько клиент платит (MRR), сколько партнёр зарабатывает (комиссия).
import { eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies, plans, tenantModules, modules, integratorLevels, integrators, integratorClients,
} from "@/lib/db/schema"

type Integrator = typeof integrators.$inferSelect

export interface PartnerClientRow {
  companyId: string
  name: string
  status: string | null              // статус клиента у партнёра (integrator_clients.status)
  subscriptionStatus: string | null  // подписка компании
  planName: string | null
  mrrRub: number                     // месячная выручка клиента, ₽
  modules: { slug: string; name: string }[]
  commissionPercent: number
  earningsRub: number                // mrrRub * % / 100
}

// Комиссия партнёра: override на партнёре, иначе из уровня, иначе 0.
export async function getPartnerCommissionPercent(integrator: Integrator): Promise<number> {
  if (integrator.commissionPercent) {
    const p = parseFloat(integrator.commissionPercent)
    if (!Number.isNaN(p)) return p
  }
  if (integrator.levelId) {
    const [lvl] = await db
      .select({ c: integratorLevels.commissionPercent })
      .from(integratorLevels)
      .where(eq(integratorLevels.id, integrator.levelId))
      .limit(1)
    if (lvl?.c) {
      const p = parseFloat(lvl.c)
      if (!Number.isNaN(p)) return p
    }
  }
  return 0
}

function monthlyKopecks(price: number, interval: string | null): number {
  return interval === "year" ? Math.round(price / 12) : price
}

export async function getPartnerClients(integrator: Integrator): Promise<PartnerClientRow[]> {
  const pct = await getPartnerCommissionPercent(integrator)

  const links = await db
    .select({ companyId: integratorClients.clientCompanyId, status: integratorClients.status })
    .from(integratorClients)
    .where(eq(integratorClients.integratorId, integrator.id))
  const ids = links.map((l) => l.companyId)
  if (ids.length === 0) return []
  const statusByCompany = new Map(links.map((l) => [l.companyId, l.status]))

  const comps = await db
    .select({
      id: companies.id,
      name: companies.name,
      brandName: companies.brandName,
      subscriptionStatus: companies.subscriptionStatus,
      planName: plans.name,
      planPrice: plans.price,
      planInterval: plans.interval,
    })
    .from(companies)
    .leftJoin(plans, eq(companies.planId, plans.id))
    .where(inArray(companies.id, ids))

  const modRows = await db
    .select({ tenantId: tenantModules.tenantId, slug: modules.slug, name: modules.name, isActive: tenantModules.isActive })
    .from(tenantModules)
    .innerJoin(modules, eq(tenantModules.moduleId, modules.id))
    .where(inArray(tenantModules.tenantId, ids))
  const modsByCompany = new Map<string, { slug: string; name: string }[]>()
  for (const m of modRows) {
    if (m.isActive === false) continue
    const arr = modsByCompany.get(m.tenantId) ?? []
    arr.push({ slug: m.slug, name: m.name })
    modsByCompany.set(m.tenantId, arr)
  }

  return comps.map((c) => {
    const mrrRub = Math.round(monthlyKopecks(c.planPrice ?? 0, c.planInterval) / 100)
    return {
      companyId: c.id,
      name: (c.brandName || c.name || "").trim(),
      status: statusByCompany.get(c.id) ?? null,
      subscriptionStatus: c.subscriptionStatus,
      planName: c.planName,
      mrrRub,
      modules: modsByCompany.get(c.id) ?? [],
      commissionPercent: pct,
      earningsRub: Math.round((mrrRub * pct) / 100),
    }
  })
}
