import { NextResponse } from "next/server"
import { auth } from "@/auth"

// ─── Response helpers ─────────────────────────────────────────────────────────

export function apiError(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    throw apiError("Unauthorized", 401)
  }
  return session.user
}

export async function requireCompany() {
  const user = await requireAuth()
  if (!user.companyId) {
    throw apiError("Company not found", 403)
  }
  return user as typeof user & { companyId: string }
}

// Компанийские (общие) настройки редактирует ТОЛЬКО директор компании.
// Допускаем: director (новое имя), client (legacy = директор), platform_admin/admin.
// platform_manager и HR-роли (hr_lead/hr_manager/…) — НЕ могут.
const DIRECTOR_ROLES = new Set<string>(["director", "client", "platform_admin", "admin"])
export async function requireDirector() {
  const user = await requireCompany()
  if (!DIRECTOR_ROLES.has(user.role as string)) {
    throw apiError("Только директор компании может изменять эти настройки", 403)
  }
  return user
}

export async function requirePlatformAdmin() {
  const user = await requireAuth()
  // DB role "admin" maps to platform_admin in the client migration
  const role = user.role as string
  if (role !== "platform_admin" && role !== "admin") {
    throw apiError("Forbidden", 403)
  }
  return user
}
