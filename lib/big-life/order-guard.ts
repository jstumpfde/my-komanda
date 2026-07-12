// Чистая анти-спам логика заказов из корзины Big Life (POST /api/public/big-life/orders).
// Тот же паттерн, что и lib/landing/lead-guard.ts — вынесено из роута, чтобы
// юнит-тестировать без БД/сети.

/** Honeypot: скрытое поле "website" — боты его заполняют, люди не видят. */
export function isHoneypotTripped(website: unknown): boolean {
  return typeof website === "string" && website.trim().length > 0
}

export const BIGLIFE_ORDER_RATE_LIMIT_MAX = 5
export const BIGLIFE_ORDER_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 час

/**
 * Не больше BIGLIFE_ORDER_RATE_LIMIT_MAX заказов в час с одного ip_hash —
 * магазин на одну позицию, повторные заказы (доп. экземпляры) — это ожидаемо
 * чаще, чем 3/час у лид-формы, поэтому лимит мягче.
 */
export function isWithinBigLifeOrderRateLimit(recentCount: number): boolean {
  return recentCount < BIGLIFE_ORDER_RATE_LIMIT_MAX
}

export const BIGLIFE_ORDER_RATE_LIMIT_MESSAGE =
  "Слишком много заказов с вашего адреса — попробуйте позже или напишите нам напрямую"
