// POST /api/platform/run-migrations
//
// Запускает все непримененные миграции настроек из SETTINGS_MIGRATIONS.
// Защита: заголовок X-Platform-Admin-Key (значение из env PLATFORM_ADMIN_KEY).
//
// Возвращает: { applied: string[], skipped: string[], failed: {id,error}[] }

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import { runPendingMigrations } from "@/lib/platform/settings-migrations"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  try {
    const createdBy = req.headers.get("x-platform-admin-email") ?? undefined
    const report = await runPendingMigrations(createdBy)
    return NextResponse.json(report)
  } catch (err) {
    console.error("[platform/run-migrations]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
