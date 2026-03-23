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
