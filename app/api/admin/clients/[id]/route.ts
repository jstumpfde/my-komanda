import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans } from "@/lib/db/schema"
import { eq, count, and, ne } from "drizzle-orm"
import { requireAuth, requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

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
      inn: companies.inn,
      kpp: companies.kpp,
      legalAddress: companies.legalAddress,
      city: companies.city,
      industry: companies.industry,
      logoUrl: companies.logoUrl,
      billingEmail: companies.billingEmail,
      subscriptionStatus: companies.subscriptionStatus,
      trialEndsAt: companies.trialEndsAt,
      planId: companies.planId,
      currentPlanId: companies.currentPlanId,
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

// DELETE /api/admin/clients/[id] — удалить компанию (только platform_admin, не active)
export async function DELETE(_req: NextRequest, { params }: Params) {
  let user
  try {
    user = await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [company] = await db
    .select({ id: companies.id, subscriptionStatus: companies.subscriptionStatus })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)

  if (!company) return apiError("Компания не найдена", 404)

  if (company.subscriptionStatus === "active") {
    return apiError("Нельзя удалить компанию с активной подпиской", 400)
  }

  // Только platform_admin может удалять
  if (user.role !== "platform_admin" && user.role !== "admin") {
    return apiError("Только администратор платформы может удалять компании", 403)
  }

  await db.delete(companies).where(eq(companies.id, id))

  return apiSuccess({ deleted: true })
}
