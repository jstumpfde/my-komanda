import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { modules, plans, planModules } from "./schema"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set")

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)

// ─── Modules ──────────────────────────────────────────────────────────────────

const MODULE_DATA = [
  { slug: "recruiting",  name: "Рекрутинг",    description: "Управление вакансиями и кандидатами", icon: "Users",      sortOrder: 1 },
  { slug: "hr-ops",      name: "HR-операции",   description: "Онбординг, сотрудники, сценарии",    icon: "UserCheck",  sortOrder: 2 },
  { slug: "talent-pool", name: "Талант-пул",    description: "База кандидатов и резерв",           icon: "Database",   sortOrder: 3 },
  { slug: "marketing",   name: "Маркетинг",     description: "Контент, SEO и аналитика",           icon: "Megaphone",  sortOrder: 4 },
  { slug: "sales",       name: "Продажи",       description: "Управление продажами и CRM",         icon: "TrendingUp", sortOrder: 5 },
]

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLAN_DATA = [
  { slug: "solo",     name: "Solo",     price: 1990000, sortOrder: 1 },
  { slug: "starter",  name: "Starter",  price: 3490000, sortOrder: 2 },
  { slug: "business", name: "Business", price: 5990000, sortOrder: 3 },
  { slug: "pro",      name: "Pro",      price: 9990000, sortOrder: 4 },
]

// ─── Plan → Module limits ─────────────────────────────────────────────────────
// null = безлимит

type Limits = {
  maxVacancies?: number | null
  maxCandidates?: number | null
  maxEmployees?: number | null
  maxScenarios?: number | null
  maxUsers?: number | null
}

const PLAN_MODULES: Record<string, Record<string, Limits>> = {
  solo: {
    recruiting: { maxVacancies: 3, maxCandidates: 100, maxUsers: 2 },
  },
  starter: {
    recruiting: { maxVacancies: 10, maxCandidates: 500, maxEmployees: 50, maxScenarios: 5,  maxUsers: 5 },
    "hr-ops":   { maxVacancies: 10, maxCandidates: 500, maxEmployees: 50, maxScenarios: 5,  maxUsers: 5 },
  },
  business: {
    recruiting:  { maxVacancies: 30, maxCandidates: 2000, maxEmployees: 200, maxScenarios: 20, maxUsers: 15 },
    "hr-ops":    { maxVacancies: 30, maxCandidates: 2000, maxEmployees: 200, maxScenarios: 20, maxUsers: 15 },
    "talent-pool": { maxVacancies: 30, maxCandidates: 2000, maxEmployees: 200, maxScenarios: 20, maxUsers: 15 },
  },
  pro: {
    recruiting:    { maxVacancies: null, maxCandidates: null, maxEmployees: null, maxScenarios: null, maxUsers: 50 },
    "hr-ops":      { maxVacancies: null, maxCandidates: null, maxEmployees: null, maxScenarios: null, maxUsers: 50 },
    "talent-pool": { maxVacancies: null, maxCandidates: null, maxEmployees: null, maxScenarios: null, maxUsers: 50 },
    marketing:     { maxVacancies: null, maxCandidates: null, maxEmployees: null, maxScenarios: null, maxUsers: 50 },
  },
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding modules...")
  const insertedModules = await db
    .insert(modules)
    .values(MODULE_DATA.map(m => ({ ...m, isActive: true })))
    .onConflictDoUpdate({ target: modules.slug, set: { name: modules.name, icon: modules.icon, sortOrder: modules.sortOrder } })
    .returning({ id: modules.id, slug: modules.slug })

  const moduleBySlug = Object.fromEntries(insertedModules.map(m => [m.slug, m.id]))
  console.log(`  ${insertedModules.length} modules inserted/updated`)

  console.log("Seeding plans...")
  const insertedPlans = await db
    .insert(plans)
    .values(PLAN_DATA.map(p => ({ ...p, currency: "RUB", interval: "month", isPublic: true })))
    .onConflictDoUpdate({ target: plans.slug, set: { name: plans.name, price: plans.price, sortOrder: plans.sortOrder } })
    .returning({ id: plans.id, slug: plans.slug })

  const planBySlug = Object.fromEntries(insertedPlans.map(p => [p.slug, p.id]))
  console.log(`  ${insertedPlans.length} plans inserted/updated`)

  console.log("Seeding plan_modules...")
  const planModuleRows = []
  for (const [planSlug, moduleLimits] of Object.entries(PLAN_MODULES)) {
    const planId = planBySlug[planSlug]
    if (!planId) continue
    for (const [moduleSlug, limits] of Object.entries(moduleLimits)) {
      const moduleId = moduleBySlug[moduleSlug]
      if (!moduleId) continue
      planModuleRows.push({ planId, moduleId, ...limits })
    }
  }

  if (planModuleRows.length > 0) {
    await db
      .insert(planModules)
      .values(planModuleRows)
      .onConflictDoUpdate({
        target: [planModules.planId, planModules.moduleId],
        set: {
          maxVacancies:  planModules.maxVacancies,
          maxCandidates: planModules.maxCandidates,
          maxEmployees:  planModules.maxEmployees,
          maxScenarios:  planModules.maxScenarios,
          maxUsers:      planModules.maxUsers,
        },
      })
  }
  console.log(`  ${planModuleRows.length} plan_modules inserted/updated`)

  console.log("Seed complete!")
  await sql.end()
}

seed().catch(err => {
  console.error("Seed failed:", err)
  process.exit(1)
})
