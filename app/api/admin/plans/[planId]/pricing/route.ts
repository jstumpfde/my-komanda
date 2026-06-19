import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { productPricing, bundleDiscounts } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { requirePlatformAdmin, apiSuccess, apiError } from "@/lib/api-helpers"

// ─── GET /api/admin/plans/[planId]/pricing ────────────────────────────────────
// Возвращает текущие цены продуктов и правила скидок для тарифного плана.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [products, discounts] = await Promise.all([
    db
      .select()
      .from(productPricing)
      .where(eq(productPricing.planId, planId))
      .orderBy(productPricing.sortOrder),
    db
      .select()
      .from(bundleDiscounts)
      .where(eq(bundleDiscounts.planId, planId))
      .orderBy(bundleDiscounts.minProducts),
  ])

  return apiSuccess({ products, discounts })
}

// ─── PUT /api/admin/plans/[planId]/pricing ────────────────────────────────────
// Принимает полный набор продуктов и правил скидок — делает upsert обоих.
//
// Body:
// {
//   products: [{ moduleId, priceKopecks, isActive?, sortOrder? }]
//   discounts: [{ minProducts, maxProducts?, discountPercent, description?, isActive? }]
// }

interface ProductInput {
  moduleId: string
  priceKopecks: number
  isActive?: boolean
  sortOrder?: number
}

interface DiscountInput {
  minProducts: number
  maxProducts?: number | null
  discountPercent: number
  description?: string | null
  isActive?: boolean
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  let body: { products?: ProductInput[]; discounts?: DiscountInput[] }
  try {
    body = await req.json()
  } catch {
    return apiError("Некорректный JSON", 400)
  }

  const { products = [], discounts = [] } = body

  // Валидация
  for (const p of products) {
    if (!p.moduleId || typeof p.priceKopecks !== "number") {
      return apiError("products[]: требуется moduleId и priceKopecks", 400)
    }
  }
  for (const d of discounts) {
    if (typeof d.minProducts !== "number" || typeof d.discountPercent !== "number") {
      return apiError("discounts[]: требуется minProducts и discountPercent", 400)
    }
  }

  await db.transaction(async (tx) => {
    // Upsert product_pricing (по planId + moduleId)
    for (const p of products) {
      await tx
        .insert(productPricing)
        .values({
          planId,
          moduleId:     p.moduleId,
          priceKopecks: p.priceKopecks,
          isActive:     p.isActive ?? true,
          sortOrder:    p.sortOrder ?? 0,
          updatedAt:    new Date(),
        })
        .onConflictDoUpdate({
          target: [productPricing.planId, productPricing.moduleId],
          set: {
            priceKopecks: p.priceKopecks,
            isActive:     p.isActive ?? true,
            sortOrder:    p.sortOrder ?? 0,
            updatedAt:    new Date(),
          },
        })
    }

    // Upsert bundle_discounts (по planId + minProducts)
    for (const d of discounts) {
      await tx
        .insert(bundleDiscounts)
        .values({
          planId,
          minProducts:     d.minProducts,
          maxProducts:     d.maxProducts ?? null,
          discountPercent: d.discountPercent,
          description:     d.description ?? null,
          isActive:        d.isActive ?? true,
        })
        .onConflictDoUpdate({
          target: [bundleDiscounts.planId, bundleDiscounts.minProducts],
          set: {
            maxProducts:     d.maxProducts ?? null,
            discountPercent: d.discountPercent,
            description:     d.description ?? null,
            isActive:        d.isActive ?? true,
          },
        })
    }
  })

  // Вернуть актуальное состояние
  const [updatedProducts, updatedDiscounts] = await Promise.all([
    db
      .select()
      .from(productPricing)
      .where(eq(productPricing.planId, planId))
      .orderBy(productPricing.sortOrder),
    db
      .select()
      .from(bundleDiscounts)
      .where(eq(bundleDiscounts.planId, planId))
      .orderBy(bundleDiscounts.minProducts),
  ])

  return apiSuccess({ products: updatedProducts, discounts: updatedDiscounts })
}
