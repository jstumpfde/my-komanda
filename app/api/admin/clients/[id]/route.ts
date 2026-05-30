import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans } from "@/lib/db/schema"
import {eq, count} from "drizzle-orm"
import {requirePlatformAdmin, apiError, apiSuccess} from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

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
      deletedAt: companies.deletedAt,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
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

  return apiSuccess({
    ...company,
    userCount: Number(userCount),
    plan: plan
      ? { ...plan, priceFormatted: Math.round(plan.price / 100) }
      : null,
  })
}

// PATCH /api/admin/clients/[id] — обновить компанию (блокировка, название и т.п.)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ["name", "subscriptionStatus", "billingEmail", "industry", "city"]
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of allowed) {
    if (key in body) updateData[key] = body[key]
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning()

  if (!updated) return apiError("Компания не найдена", 404)

  return apiSuccess({ id: updated.id, subscriptionStatus: updated.subscriptionStatus, name: updated.name })
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
