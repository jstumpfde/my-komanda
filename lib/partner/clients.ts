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
  // Прогресс по уровням (для виджета в кабинете). Имена/пороги — из integratorLevels
  // (редактируются админом). Если override активен или ступени не заданы — null/100%.
  currentTierName: string | null
  currentTierMinMrrRub: number
  nextTierName: string | null
  nextTierMinMrrRub: number | null
  nextTierCommissionPercent: number | null
  progressToNextPercent: number   // 0-100; 100 = достигнут максимум
}

// ─── Управление продуктами клиента (карточка клиента у партнёра) ──────────────

export interface ClientProduct { slug: string; name: string; enabled: boolean }

// Все продукты платформы + флаг, включён ли каждый у клиента.
export async function getClientProducts(companyId: string): Promise<ClientProduct[]> {
  const all = await db
    .select({ id: modules.id, slug: modules.slug, name: modules.name })
    .from(modules)
    .where(eq(modules.isActive, true))
    .orderBy(asc(modules.sortOrder))
  const active = await db
    .select({ moduleId: tenantModules.moduleId, isActive: tenantModules.isActive })
    .from(tenantModules)
    .where(eq(tenantModules.tenantId, companyId))
  const activeIds = new Set(active.filter((a) => a.isActive !== false).map((a) => a.moduleId))
  return all.map((m) => ({ slug: m.slug, name: m.name, enabled: activeIds.has(m.id) }))
}

// Привести набор активных модулей клиента к переданным slug (вкл новые, выкл лишние).
export async function setClientModules(companyId: string, slugs: string[]): Promise<void> {
  const wanted = new Set(slugs)
  const all = await db.select({ id: modules.id, slug: modules.slug }).from(modules).where(eq(modules.isActive, true))
  for (const m of all) {
    const shouldOn = wanted.has(m.slug)
    // upsert tenant_modules с нужным isActive
    await db.insert(tenantModules)
      .values({ tenantId: companyId, moduleId: m.id, isActive: shouldOn, enabledAt: shouldOn ? new Date() : null })
      .onConflictDoUpdate({
        target: [tenantModules.tenantId, tenantModules.moduleId],
        set: { isActive: shouldOn, disabledAt: shouldOn ? null : new Date() },
      })
  }
}

interface Tier { name: string; minMrrKopecks: number; pct: number }

async function getTiers(): Promise<Tier[]> {
  const rows = await db
    .select({ name: integratorLevels.name, m: integratorLevels.minMrrKopecks, c: integratorLevels.commissionPercent })
    .from(integratorLevels)
    .where(eq(integratorLevels.isActive, true))
    .orderBy(asc(integratorLevels.minMrrKopecks))
  return rows
    .map((r) => ({ name: r.name, minMrrKopecks: r.m ?? 0, pct: parseFloat(r.c) }))
    .filter((t) => !Number.isNaN(t.pct))
}

// Высшая ступень, чей порог достигнут суммарным оборотом (в копейках).
function tierPercent(tiers: Tier[], totalKopecks: number): number {
  let pct = 0
  for (const t of tiers) if (totalKopecks >= t.minMrrKopecks) pct = t.pct
  return pct
}

// Прогресс по ступеням: текущая (высшая достигнутая), следующая (по порядку
// порога) и % до неё. tiers должны быть отсортированы по minMrrKopecks asc.
interface TierProgress {
  currentTierName: string | null
  currentTierMinMrrRub: number
  nextTierName: string | null
  nextTierMinMrrRub: number | null
  nextTierCommissionPercent: number | null
  progressToNextPercent: number
}
function computeTierProgress(tiers: Tier[], totalKopecks: number): TierProgress {
  let currentIdx = -1
  for (let i = 0; i < tiers.length; i++) {
    if (totalKopecks >= tiers[i].minMrrKopecks) currentIdx = i
  }
  const current = currentIdx >= 0 ? tiers[currentIdx] : null
  const next = currentIdx + 1 < tiers.length ? tiers[currentIdx + 1] : null

  let progress = 100
  if (next) {
    const currentMin = current ? current.minMrrKopecks : 0
    const span = next.minMrrKopecks - currentMin
    progress = span > 0
      ? Math.max(0, Math.min(100, Math.round(((totalKopecks - currentMin) / span) * 100)))
      : 100
  }

  return {
    currentTierName: current?.name ?? null,
    currentTierMinMrrRub: Math.round((current?.minMrrKopecks ?? 0) / 100),
    nextTierName: next?.name ?? null,
    nextTierMinMrrRub: next ? Math.round(next.minMrrKopecks / 100) : null,
    nextTierCommissionPercent: next?.pct ?? null,
    progressToNextPercent: progress,
  }
}

function monthlyKopecks(price: number, interval: string | null): number {
  return interval === "year" ? Math.round(price / 12) : price
}

export async function getPartnerSummary(integrator: Integrator): Promise<PartnerSummary> {
  const allLinks = await db
    .select({ companyId: integratorClients.clientCompanyId, status: integratorClients.status })
    .from(integratorClients)
    .where(eq(integratorClients.integratorId, integrator.id))
  // Отвязанные клиенты (status='cancelled') в кабинете не показываем.
  const links = allLinks.filter((l) => l.status !== "cancelled")
  const ids = links.map((l) => l.companyId)
  const statusByCompany = new Map(links.map((l) => [l.companyId, l.status]))

  // Считаем MRR клиентов (в копейках) + собираем строки без % (его узнаем ниже).
  const base: Omit<PartnerClientRow, "commissionPercent" | "earningsRub">[] = []
  let totalKopecks = 0
  if (ids.length > 0) {
    // ВНИМАНИЕ: companies.plan_id на проде имеет тип text (дрейф схемы), а plans.id —
    // uuid, поэтому JOIN по колонкам падает (text = uuid). Тянем планы отдельным
    // запросом по id (параметр приводится к uuid корректно).
    const compRows = await db
      .select({
        id: companies.id, name: companies.name, brandName: companies.brandName,
        subscriptionStatus: companies.subscriptionStatus, planId: companies.planId,
      })
      .from(companies)
      .where(inArray(companies.id, ids))

    const planIds = [...new Set(compRows.map((c) => c.planId).filter((p): p is string => !!p))]
    const planById = new Map<string, { name: string; price: number; interval: string | null }>()
    if (planIds.length > 0) {
      const planRows = await db
        .select({ id: plans.id, name: plans.name, price: plans.price, interval: plans.interval })
        .from(plans)
        .where(inArray(plans.id, planIds))
      for (const p of planRows) planById.set(p.id, { name: p.name, price: p.price, interval: p.interval })
    }
    const comps = compRows.map((c) => {
      const plan = c.planId ? planById.get(c.planId) : undefined
      return {
        id: c.id, name: c.name, brandName: c.brandName,
        subscriptionStatus: c.subscriptionStatus,
        planName: plan?.name ?? null, planPrice: plan?.price ?? null, planInterval: plan?.interval ?? null,
      }
    })

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
  const tiers = await getTiers()
  const override = integrator.commissionPercent ? parseFloat(integrator.commissionPercent) : NaN
  const isOverride = !Number.isNaN(override)
  const effectivePercent = isOverride ? override : tierPercent(tiers, totalKopecks)

  const clients: PartnerClientRow[] = base.map((b) => ({
    ...b,
    commissionPercent: effectivePercent,
    earningsRub: Math.round((b.mrrRub * effectivePercent) / 100),
  }))

  const progress = computeTierProgress(tiers, totalKopecks)

  return {
    clients,
    effectivePercent,
    isOverride,
    totalMrrRub: Math.round(totalKopecks / 100),
    totalEarningsRub: clients.reduce((s, c) => s + c.earningsRub, 0),
    ...progress,
  }
}
