import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { plans, companies } from "@/lib/db/schema"
import { eq, and, isNull, isNotNull, or, count } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ planId: string }> }

// POST /api/admin/plans/[planId]/trash — переместить тариф в корзину.
// Можно из активного или из архива.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [plan] = await db
    .select({ id: plans.id, deletedAt: plans.deletedAt })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1)

  if (!plan) return apiError("Тариф не найден", 404)
  if (plan.deletedAt) return apiError("Тариф уже в корзине", 400)

  const [trashed] = await db
    .update(plans)
    .set({ deletedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning({ id: plans.id })

  if (!trashed) return apiError("Не удалось переместить в корзину", 500)

  return apiSuccess({ trashed: true })
}

// DELETE /api/admin/plans/[planId]/trash — удалить тариф навсегда.
// Только из корзины. Блокируется если на плане есть компании.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [plan] = await db
    .select({ id: plans.id, deletedAt: plans.deletedAt, name: plans.name })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1)

  if (!plan) return apiError("Тариф не найден", 404)
  if (!plan.deletedAt) return apiError("Сначала переместите тариф в корзину", 400)

  // Проверяем, есть ли компании на этом тарифе
  const [{ usedBy }] = await db
    .select({ usedBy: count() })
    .from(companies)
    .where(
      and(
        isNull(companies.deletedAt),
        or(eq(companies.planId, planId), eq(companies.currentPlanId, planId))
      )
    )

  if (Number(usedBy) > 0) {
    return apiError(
      `Невозможно удалить: тариф используется ${usedBy} компани${Number(usedBy) === 1 ? "ей" : Number(usedBy) < 5 ? "ями" : "ями"}. Сначала переведите их на другой тариф.`,
      409
    )
  }

  await db.delete(plans).where(eq(plans.id, planId))

  return apiSuccess({ deleted: true })
}

// PATCH /api/admin/plans/[planId]/trash — восстановить тариф из корзины
// (удалить признак deleted_at).
export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [restored] = await db
    .update(plans)
    .set({ deletedAt: null })
    .where(and(eq(plans.id, planId), isNotNull(plans.deletedAt)))
    .returning({ id: plans.id })

  if (!restored) return apiError("Тариф не найден в корзине", 404)

  return apiSuccess({ restored: true })
}
