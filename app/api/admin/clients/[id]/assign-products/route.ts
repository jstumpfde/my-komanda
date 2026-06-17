import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, tenantModules, productPricing, bundleDiscounts } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { requirePlatformAdmin, apiSuccess, apiError } from "@/lib/api-helpers"
import { computeBundlePrice } from "@/lib/pricing/calc"

type Params = { params: Promise<{ id: string }> }

interface ProductAssignment {
  moduleId: string
  enabled: boolean
  priceOverrideKopecks?: number | null
}

// ─── POST /api/admin/clients/[id]/assign-products ─────────────────────────────
// Назначает набор модулей клиенту, рассчитывает цену со скидкой за набор,
// обновляет tenant_modules (price_kopecks, applied_discount_percent).
//
// Body:
// {
//   products: [{ moduleId, enabled, priceOverrideKopecks? }]
// }
//
// Ответ:
// {
//   subtotalKopecks, discountPercent, discountKopecks, totalKopecks, productCount,
//   assignments: [{ moduleId, enabled, priceKopecks, appliedDiscountPercent }]
// }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id: companyId } = await params

  let body: { products?: ProductAssignment[] }
  try {
    body = await req.json()
  } catch {
    return apiError("Некорректный JSON", 400)
  }

  const { products = [] } = body

  if (!Array.isArray(products) || products.length === 0) {
    return apiError("products[] обязателен и не должен быть пустым", 400)
  }

  for (const p of products) {
    if (!p.moduleId || typeof p.enabled !== "boolean") {
      return apiError("products[]: требуется moduleId и enabled", 400)
    }
  }

  // Определяем план клиента (currentPlanId приоритетнее planId)
  const [company] = await db
    .select({ planId: companies.planId, currentPlanId: companies.currentPlanId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    return apiError("Компания не найдена", 404)
  }

  const planId = company.currentPlanId ?? company.planId

  // Включаемые модули (enabled=true) — для них рассчитываем цену
  const enabledProducts = products.filter((p) => p.enabled)
  const enabledModuleIds = enabledProducts.map((p) => p.moduleId)

  // Загружаем цены из product_pricing для плана (если plan задан)
  let pricingMap: Map<string, number> = new Map()
  if (planId && enabledModuleIds.length > 0) {
    const pricingRows = await db
      .select({ moduleId: productPricing.moduleId, priceKopecks: productPricing.priceKopecks })
      .from(productPricing)
      .where(
        and(
          eq(productPricing.planId, planId),
          inArray(productPricing.moduleId, enabledModuleIds),
          eq(productPricing.isActive, true),
        ),
      )
    pricingMap = new Map(pricingRows.map((r) => [r.moduleId, r.priceKopecks]))
  }

  // Формируем items для расчёта: цена = override ?? product_pricing ?? 0
  const pricingItems = enabledProducts.map((p) => ({
    moduleId: p.moduleId,
    priceKopecks:
      p.priceOverrideKopecks != null
        ? p.priceOverrideKopecks
        : (pricingMap.get(p.moduleId) ?? 0),
  }))

  // Загружаем правила скидок для плана
  let discountRules: { minProducts: number; maxProducts: number | null; discountPercent: number }[] = []
  if (planId) {
    discountRules = await db
      .select({
        minProducts:     bundleDiscounts.minProducts,
        maxProducts:     bundleDiscounts.maxProducts,
        discountPercent: bundleDiscounts.discountPercent,
      })
      .from(bundleDiscounts)
      .where(and(eq(bundleDiscounts.planId, planId), eq(bundleDiscounts.isActive, true)))
  }

  // Рассчитываем итоговую стоимость
  const pricing = computeBundlePrice(pricingItems, discountRules)

  // Upsert tenant_modules для всех переданных продуктов
  await db.transaction(async (tx) => {
    for (const p of products) {
      const itemPrice = pricingItems.find((i) => i.moduleId === p.moduleId)
      const priceKopecks = itemPrice?.priceKopecks ?? null
      const appliedDiscountPercent = p.enabled ? pricing.discountPercent : 0

      await tx
        .insert(tenantModules)
        .values({
          tenantId:               companyId,
          moduleId:               p.moduleId,
          isActive:               p.enabled,
          activatedAt:            p.enabled ? new Date() : undefined,
          priceKopecks:           priceKopecks,
          appliedDiscountPercent: appliedDiscountPercent,
          quantity:               1,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: {
            isActive:               p.enabled,
            priceKopecks:           priceKopecks,
            appliedDiscountPercent: appliedDiscountPercent,
          },
        })
    }
  })

  // Формируем детализацию по модулям для ответа
  const assignments = products.map((p) => {
    const itemPrice = pricingItems.find((i) => i.moduleId === p.moduleId)
    return {
      moduleId:               p.moduleId,
      enabled:                p.enabled,
      priceKopecks:           p.enabled ? (itemPrice?.priceKopecks ?? 0) : 0,
      appliedDiscountPercent: p.enabled ? pricing.discountPercent : 0,
    }
  })

  return apiSuccess({
    subtotalKopecks:  pricing.subtotalKopecks,
    productCount:     pricing.productCount,
    discountPercent:  pricing.discountPercent,
    discountKopecks:  pricing.discountKopecks,
    totalKopecks:     pricing.totalKopecks,
    assignments,
  })
}
