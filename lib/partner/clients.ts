// Данные клиентов партнёра + расчёт комиссии для кабинета /partner.
//
// Комиссия = СТУПЕНЧАТАЯ по суммарному обороту клиентов (integrator_levels:
// min_mrr_kopecks → commission_percent), берём высшую ступень, чей порог достигнут.
// Если у партнёра задан фикс-override (integrators.commission_percent) — он
// перекрывает ступени (напр. сразу 50%). Пороги настраиваются в /admin/integrators/levels.
import { eq, inArray, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies, plans, tenantModules, modules, integratorLevels, integrators, integratorClients,
} from "@/lib/db/schema"

type Integrator = typeof integrators.$inferSelect

export interface PartnerClientRow {
  companyId: string
  name: string
  status: string | null
  subscriptionStatus: string | null
  planName: string | null
  mrrRub: number
  modules: { slug: string; name: string }[]
  commissionPercent: number
  earningsRub: number
}

export interface PartnerSummary {
  clients: PartnerClientRow[]
  effectivePercent: number   // итоговая комиссия партнёра (ступень или override)
  isOverride: boolean        // true = фикс-% задан вручную, ступени не применяются
  totalMrrRub: number
  totalEarningsRub: number
}

interface Tier { minMrrKopecks: number; pct: number }

async function getTiers(): Promise<Tier[]> {
  const rows = await db
    .select({ m: integratorLevels.minMrrKopecks, c: integratorLevels.commissionPercent })
    .from(integratorLevels)
    .where(eq(integratorLevels.isActive, true))
    .orderBy(asc(integratorLevels.minMrrKopecks))
  return rows
    .map((r) => ({ minMrrKopecks: r.m ?? 0, pct: parseFloat(r.c) }))
    .filter((t) => !Number.isNaN(t.pct))
}

// Высшая ступень, чей порог достигнут суммарным оборотом (в копейках).
function tierPercent(tiers: Tier[], totalKopecks: number): number {
  let pct = 0
  for (const t of tiers) if (totalKopecks >= t.minMrrKopecks) pct = t.pct
  return pct
}

function monthlyKopecks(price: number, interval: string | null): number {
  return interval === "year" ? Math.round(price / 12) : price
}

export async function getPartnerSummary(integrator: Integrator): Promise<PartnerSummary> {
  const links = await db
    .select({ companyId: integratorClients.clientCompanyId, status: integratorClients.status })
    .from(integratorClients)
    .where(eq(integratorClients.integratorId, integrator.id))
  const ids = links.map((l) => l.companyId)
  const statusByCompany = new Map(links.map((l) => [l.companyId, l.status]))

  // Считаем MRR клиентов (в копейках) + собираем строки без % (его узнаем ниже).
  const base: Omit<PartnerClientRow, "commissionPercent" | "earningsRub">[] = []
  let totalKopecks = 0
  if (ids.length > 0) {
    const comps = await db
      .select({
        id: companies.id, name: companies.name, brandName: companies.brandName,
        subscriptionStatus: companies.subscriptionStatus,
        planName: plans.name, planPrice: plans.price, planInterval: plans.interval,
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

    for (const c of comps) {
      const kop = monthlyKopecks(c.planPrice ?? 0, c.planInterval)
      totalKopecks += kop
      base.push({
        companyId: c.id,
        name: (c.brandName || c.name || "").trim(),
        status: statusByCompany.get(c.id) ?? null,
        subscriptionStatus: c.subscriptionStatus,
        planName: c.planName,
        mrrRub: Math.round(kop / 100),
        modules: modsByCompany.get(c.id) ?? [],
      })
    }
  }

  // Итоговая комиссия: override или ступень по суммарному обороту.
  const override = integrator.commissionPercent ? parseFloat(integrator.commissionPercent) : NaN
  const isOverride = !Number.isNaN(override)
  const effectivePercent = isOverride ? override : tierPercent(await getTiers(), totalKopecks)

  const clients: PartnerClientRow[] = base.map((b) => ({
    ...b,
    commissionPercent: effectivePercent,
    earningsRub: Math.round((b.mrrRub * effectivePercent) / 100),
  }))

  return {
    clients,
    effectivePercent,
    isOverride,
    totalMrrRub: Math.round(totalKopecks / 100),
    totalEarningsRub: clients.reduce((s, c) => s + c.earningsRub, 0),
  }
}
