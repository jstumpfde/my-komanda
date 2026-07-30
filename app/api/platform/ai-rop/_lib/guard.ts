// Общий гейт для UI-фетчей платформенной админки AI-РОП.
// Тот же паттерн, что у соседних /api/platform/deadlines и /api/platform/consent-log:
// сессионный email из PLATFORM_ADMIN_EMAILS, иначе 404 (скрываем сам факт
// существования раздела, а не 401/403 — см. Group 14 в CLAUDE.md).
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export async function requireAiRopAdmin(): Promise<{ email: string } | NextResponse> {
  const session = await auth()
  const email = session?.user?.email
  if (!email || !isPlatformAdminEmail(email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return { email }
}

export function isGateResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}
