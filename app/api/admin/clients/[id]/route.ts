import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans, integratorClients, integrators } from "@/lib/db/schema"
import {and, eq, count} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {requirePlatformAdmin, apiError, apiSuccess} from "@/lib/api-helpers"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

type Params = { params: Promise<{ id: string }> }

const SUBSCRIPTION_STATUSES = ["trial", "active", "paused", "cancelled", "expired"]

// Допустимые ключи модулей для companies.enabled_modules (per-company оверрайд
// сайдбара). Должны совпадать с ModuleId (lib/modules/types.ts).
const MODULE_KEYS = [
  "hr", "knowledge", "learning", "tasks", "sales", "marketing",
  "b2b", "warehouse", "logistics", "booking", "dialer", "qc",
  "price_monitor",
] as const

// GET /api/admin/clients/[id] — полная информация о компании
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      fullName: companies.fullName,
      brandName: companies.brandName,
      inn: companies.inn,
      kpp: companies.kpp,
      ogrn: companies.ogrn,
      legalAddress: companies.legalAddress,
      officeAddress: companies.officeAddress,
      postalAddress: companies.postalAddress,
      postalCode: companies.postalCode,
      city: companies.city,
      industry: companies.industry,
      director: companies.director,
      email: companies.email,
      phone: companies.phone,
      website: companies.website,
      logoUrl: companies.logoUrl,
      billingEmail: companies.billingEmail,
      subscriptionStatus: companies.subscriptionStatus,
      trialEndsAt: companies.trialEndsAt,
      planId: companies.planId,
      currentPlanId: companies.currentPlanId,
      enabledModules:   companies.enabledModules,
      salesManagerId:   companies.salesManagerId,
      accountManagerId: companies.accountManagerId,
      deletedAt:        companies.deletedAt,
      createdAt:        companies.createdAt,
      updatedAt:        companies.updatedAt,
    })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)

  if (!company) return apiError("Компания не найдена", 404)

  const [{ userCount }] = await db
    .select({ userCount: count() })
    .from(users)
    .where(eq(users.companyId, id))

  const planId = company.currentPlanId ?? company.planId
  const plan = planId
    ? (await db.select({ id: plans.id, name: plans.name, price: plans.price, slug: plans.slug })
        .from(plans).where(eq(plans.id, planId)).limit(1))[0] ?? null
    : null

  // Партнёр компании (активная связь integrator_clients).
  const partnerCompanies = alias(companies, "partner_companies")
  const [partner] = await db
    .select({
      partnerIntegratorId: integrators.id,
      partnerName:         partnerCompanies.name,
    })
    .from(integratorClients)
    .innerJoin(integrators, eq(integratorClients.integratorId, integrators.id))
    .leftJoin(partnerCompanies, eq(integrators.companyId, partnerCompanies.id))
    .where(and(
      eq(integratorClients.clientCompanyId, id),
      eq(integratorClients.status, "active"),
    ))
    .limit(1)

  return apiSuccess({
    ...company,
    userCount: Number(userCount),
    plan: plan
      ? { ...plan, priceFormatted: Math.round(plan.price / 100) }
      : null,
    partnerName: partner?.partnerName ?? null,
    partnerIntegratorId: partner?.partnerIntegratorId ?? null,
    linkStatus: partner ? "active" : null,
  })
}

// PATCH /api/admin/clients/[id] — обновить компанию: реквизиты, статус подписки,
// смена тарифа (currentPlanId).
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Текстовые реквизиты — пустую строку трактуем как очистку (null).
  const allowed = [
    "name", "fullName", "inn", "kpp", "ogrn",
    "legalAddress", "officeAddress", "postalAddress",
    "city", "industry", "billingEmail", "subscriptionStatus",
  ]
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of allowed) {
    if (key in body) {
      const v = body[key]
      // name обязателен — не позволяем стереть в null.
      if (typeof v === "string" && v.trim() === "") {
        updateData[key] = key === "name" ? undefined : null
      } else {
        updateData[key] = v
      }
      if (updateData[key] === undefined) delete updateData[key]
    }
  }

  // Валидация статуса подписки по enum.
  if ("subscriptionStatus" in updateData
    && updateData.subscriptionStatus != null
    && !SUBSCRIPTION_STATUSES.includes(updateData.subscriptionStatus as string)) {
    return apiError("Недопустимый статус подписки", 400)
  }

  // Смена тарифа: companies.currentPlanId (uuid FK → plans.id). Пусто = снять тариф.
  if ("planId" in body) {
    const planId = body.planId
    if (planId == null || planId === "" || planId === "none") {
      updateData.currentPlanId = null
    } else if (typeof planId === "string") {
      const [plan] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1)
      if (!plan) return apiError("Тариф не найден", 400)
      updateData.currentPlanId = planId
    } else {
      return apiError("Некорректный тариф", 400)
    }
  }

  // Per-company оверрайд видимых модулей сайдбара (companies.enabled_modules).
  //   null / [] / отсутствует пригодных ключей → grandfather (модули по роли);
  //   непустой массив валидных ключей → компания видит ИМЕННО эти модули.
  // НЕ лицензионный гейтинг — безопасный per-company переключатель видимости.
  if ("enabledModules" in body) {
    const raw = body.enabledModules
    if (raw == null) {
      updateData.enabledModules = null // сброс → grandfather
    } else if (Array.isArray(raw)) {
      // Дедуп + только валидные ключи; неизвестные ключи молча отбрасываем.
      const cleaned = Array.from(
        new Set(raw.filter((k): k is string => typeof k === "string" && (MODULE_KEYS as readonly string[]).includes(k))),
      )
      // Пустой выбор трактуем как сброс (null = grandfather).
      updateData.enabledModules = cleaned.length > 0 ? cleaned : null
    } else {
      return apiError("Некорректный список модулей", 400)
    }
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning()

  if (!updated) return apiError("Компания не найдена", 404)

  return apiSuccess({
    id: updated.id,
    name: updated.name,
    fullName: updated.fullName,
    inn: updated.inn,
    kpp: updated.kpp,
    ogrn: updated.ogrn,
    legalAddress: updated.legalAddress,
    officeAddress: updated.officeAddress,
    postalAddress: updated.postalAddress,
    city: updated.city,
    industry: updated.industry,
    billingEmail: updated.billingEmail,
    subscriptionStatus: updated.subscriptionStatus,
    currentPlanId: updated.currentPlanId,
    enabledModules: updated.enabledModules,
  })
}

// DELETE /api/admin/clients/[id] — в корзину (soft-delete). Обратимо, поэтому
// без ограничения по активной подписке. Необратимое удаление — отдельный
// эндпоинт /permanent (с гардами).
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [updated] = await db
    .update(companies)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning({ id: companies.id })

  if (!updated) return apiError("Компания не найдена", 404)

  return apiSuccess({ trashed: true })
}
