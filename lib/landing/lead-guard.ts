// Чистая анти-спам логика формы заявок лендинга (POST /api/public/landing-lead).
// Вынесена из роута, чтобы юнит-тестировать без БД/сети (правило проекта —
// см. lib/messaging/guard-alert.ts для того же паттерна).

/** Honeypot: скрытое поле "website" — боты его заполняют, люди не видят. */
export function isHoneypotTripped(website: unknown): boolean {
  return typeof website === "string" && website.trim().length > 0
}

export const LANDING_LEAD_RATE_LIMIT_MAX = 3
export const LANDING_LEAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 час

/**
 * Не больше LANDING_LEAD_RATE_LIMIT_MAX заявок в час с одного ip_hash.
 * recentCreatedAtMs — таймстемпы существующих заявок этого ip_hash за окно
 * (роут сам фильтрует по created_at >= now - window при выборке из БД).
 */
export function isWithinLandingLeadRateLimit(recentCount: number): boolean {
  return recentCount < LANDING_LEAD_RATE_LIMIT_MAX
}

export const LANDING_LEAD_RATE_LIMIT_MESSAGE =
  "Слишком много заявок с вашего адреса — попробуйте позже или напишите нам напрямую"
