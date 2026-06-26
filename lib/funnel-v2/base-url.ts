/**
 * Серверный helper: получить базовый URL приложения.
 *
 * Приоритет:
 *   1. NEXT_PUBLIC_APP_URL (явно задан для прода/стейджинга)
 *   2. NEXTAUTH_URL (стандартный Next-Auth env)
 *   3. Хардкод "https://company24.pro" (fallback, прод)
 *
 * Используется в funnel-v2 рантайме и роутах /demo, /test для генерации
 * ссылок кандидату и редиректов. Без request — только env-переменные.
 */
export function getAppBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://company24.pro"
  return url.replace(/\/$/, "")
}
