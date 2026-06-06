// Group 14 — общая защита для платформенных операций.
//
// Все /api/platform/* эндпоинты защищены секретным заголовком
// X-Platform-Admin-Key, значение которого хранится в env PLATFORM_ADMIN_KEY.
// Это позволяет дёргать критичные операции из cron/CLI без сессии.
//
// Admin UI /admin/platform защищён иначе — по email в PLATFORM_ADMIN_EMAILS
// (см. layout.tsx).

import { NextRequest, NextResponse } from "next/server"

const HEADER = "x-platform-admin-key"

export function requirePlatformKey(req: NextRequest): NextResponse | null {
  const expected = process.env.PLATFORM_ADMIN_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "PLATFORM_ADMIN_KEY not configured on server" },
      { status: 500 },
    )
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
