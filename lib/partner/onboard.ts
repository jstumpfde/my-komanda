// Партнёр сам онбордит клиента: создаёт компанию + директора-логин + включает
// продукты (модули) + привязывает клиента к партнёру. Без участия админа.
import { eq, inArray } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { companies, users, modules, tenantModules, integratorClients, integrators } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"

type Integrator = typeof integrators.$inferSelect

// Если у партнёрской компании назначен salesManagerId — наследуем его клиенту.
// Иначе «кто завёл» (onboardedByUserId партнёра) становится менеджером продаж.
async function resolveSalesManagerId(integrator: Integrator, onboardedByUserId: string): Promise<string> {
  const [partnerCompany] = await db
    .select({ salesManagerId: companies.salesManagerId })
    .from(companies)
    .where(eq(companies.id, integrator.companyId))
    .limit(1)
  return partnerCompany?.salesManagerId ?? onboardedByUserId
}

export interface OnboardInput {
  companyName: string
  directorEmail: string
  directorName?: string
  moduleSlugs: string[]
  funnelScenario?: string
}
export interface OnboardResult {
  companyId: string
  directorEmail: string
  tempPassword: string
}

// Временный пароль директора — партнёр передаёт клиенту, тот меняет при входе.
// Без неоднозначных символов (0/O, 1/l).
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let s = ""
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function createClientForPartner(
  integrator: Integrator,
  onboardedByUserId: string,
  input: OnboardInput,
): Promise<OnboardResult> {
  const name = (input.companyName ?? "").trim()
  const email = (input.directorEmail ?? "").trim().toLowerCase()
  if (!name) throw apiError("Укажите название компании", 400)
  if (!email || !email.includes("@")) throw apiError("Укажите корректный email директора", 400)

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existingUser) throw apiError("Пользователь с таким email уже существует", 409)

  // 1. Компания клиента (NOT NULL-поля берут дефолты схемы).
  // Авто-назначение: если у партнёра есть salesManagerId — наследуем,
  // иначе «кто завёл» (onboardedByUserId) становится менеджером продаж.
  const salesManagerId = await resolveSalesManagerId(integrator, onboardedByUserId)
  const scenario = (input.funnelScenario ?? "").trim()
  const [company] = await db.insert(companies).values({
    name,
    salesManagerId,
    ...(scenario ? { hiringDefaultsJson: { funnelScenario: scenario } } : {}),
  }).returning({ id: companies.id })

  // 2. Директор-логин.
  const tempPassword = genPassword()
  await db.insert(users).values({
    email,
    name: input.directorName?.trim() || name,
    passwordHash: bcrypt.hashSync(tempPassword, 10),
    role: "director",
    companyId: company.id,
  })

  // 3. Подключённые продукты (модули).
  const slugs = (input.moduleSlugs ?? []).filter((s): s is string => typeof s === "string" && s.length > 0)
  if (slugs.length > 0) {
    const mods = await db.select({ id: modules.id }).from(modules).where(inArray(modules.slug, slugs))
    if (mods.length > 0) {
      await db.insert(tenantModules).values(
        mods.map((m) => ({
          tenantId: company.id, moduleId: m.id, isActive: true,
          enabledAt: new Date(), activatedAt: new Date(),
        })),
      ).onConflictDoNothing()
    }
  }

  // 4. Привязка клиента к партнёру.
  await db.insert(integratorClients).values({
    integratorId: integrator.id,
    clientCompanyId: company.id,
    onboardedByUserId,
    status: "active",
  }).onConflictDoNothing()

  return { companyId: company.id, directorEmail: email, tempPassword }
}
