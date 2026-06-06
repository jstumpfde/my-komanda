// POST /api/platform/emergency/restore-all-ai-chatbots
// Защита: X-Platform-Admin-Key. Снимает kill-switch у всех компаний.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import {
  emergencyRestoreAllAiChatbots,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const result = await emergencyRestoreAllAiChatbots()
    await recordEmergencyAction(
      "restore_all_ai_chatbots",
      null,
      result,
      req.headers.get("x-platform-admin-email") ?? undefined,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error("[emergency/restore-all-ai-chatbots]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
