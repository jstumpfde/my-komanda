/**
 * lib/pricing/calc.ts
 * Чистая функция расчёта стоимости набора модулей со скидкой за набор.
 * Без зависимостей от БД — юнит-тестируема.
 */

export interface PricingItem {
  moduleId: string
  priceKopecks: number
}

export interface DiscountRule {
  minProducts: number
  maxProducts: number | null  // null = без верхней границы
  discountPercent: number
}

export interface BundlePriceResult {
  subtotalKopecks: number
  productCount: number
  discountPercent: number
  discountKopecks: number
  totalKopecks: number
}

/**
 * Вычисляет стоимость набора модулей с учётом скидки за количество.
 *
 * Алгоритм:
 *  1. subtotal = Σ priceKopecks по всем items
 *  2. N = items.length
 *  3. Из rules берём все подходящие (minProducts <= N <= maxProducts|∞)
 *     и выбираем наибольший discountPercent (максимальная скидка)
 *  4. total = round(subtotal * (1 - discountPercent / 100))
 */
export function computeBundlePrice(
  items: PricingItem[],
  rules: DiscountRule[],
): BundlePriceResult {
  const subtotalKopecks = items.reduce((sum, item) => sum + item.priceKopecks, 0)
  const productCount = items.length

  // Находим все подходящие правила и выбираем максимальную скидку
  let discountPercent = 0
  for (const rule of rules) {
    const withinMin = productCount >= rule.minProducts
    const withinMax = rule.maxProducts === null || productCount <= rule.maxProducts
    if (withinMin && withinMax && rule.discountPercent > discountPercent) {
      discountPercent = rule.discountPercent
    }
  }

  // Ограничиваем скидку диапазоном 0–100 на случай некорректных данных
  discountPercent = Math.max(0, Math.min(100, discountPercent))

  const discountKopecks = Math.round(subtotalKopecks * discountPercent / 100)
  const totalKopecks = subtotalKopecks - discountKopecks

  return {
    subtotalKopecks,
    productCount,
    discountPercent,
    discountKopecks,
    totalKopecks,
  }
}
