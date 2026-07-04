// Group 14 — общая защита для платформенных операций.
//
// Все /api/platform/* эндпоинты защищены секретным заголовком
// X-Platform-Admin-Key, значение которого хранится в env PLATFORM_ADMIN_KEY.
// Это позволяет дёргать критичные операции из cron/CLI без сессии.
//
// Admin UI /admin/platform защищён иначе — по email в PLATFORM_ADMIN_EMAILS
// (см. layout.tsx).

import { NextRequest, NextResponse } from "next/server"
import { requireAuth, apiError } from "@/lib/api-helpers"

const HEADER = "x-platform-admin-key"

export function requirePlatformKey(req: NextRequest): NextResponse | null {
  const expected = process.env.PLATFORM_ADMIN_KEY
  if (!expected) {
    // Ключ не сконфигурирован — отдаём 404, как будто роута не существует,
    // а не 500 с именем env (не раскрываем структуру платформенных эндпоинтов).
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const got = req.headers.get(HEADER)
  if (!got || got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? ""
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

// Сессионный гард для платформенных данных (лиды, заявки на доступ и т.п.):
// пускаем по платформенной роли ИЛИ по email из PLATFORM_ADMIN_EMAILS.
// Бросает Response (401/403), как requireAuth/requireCompany.
export async function requirePlatformOperator() {
  const user = await requireAuth()
  const role = user.role as string
  if (role === "platform_admin" || role === "admin") return user
  if (isPlatformAdminEmail(user.email)) return user
  throw apiError("Forbidden", 403)
}

// Гард для админ-эндпоинтов, ВКЛЮЧАЯ platform_manager.
// Пускаем по любой платформенной роли (platform_admin/platform_manager/admin)
// ИЛИ по email из PLATFORM_ADMIN_EMAILS — так же, как /admin layout
// ((role && isPlatformRole(role)) || isPlatformAdminEmail(email)).
// Это важно: владелец-директор с whitelisted-email НЕ должен получать 403.
// Бросает Response (401/403), как requireAuth/requireCompany.
const ADMIN_PLATFORM_ROLES = new Set<string>(["platform_admin", "platform_manager", "admin"])
export async function requireAdminPanelAccess() {
  const user = await requireAuth()
  const role = user.role as string
  if (ADMIN_PLATFORM_ROLES.has(role)) return user
  if (isPlatformAdminEmail(user.email)) return user
  throw apiError("Forbidden", 403)
}
