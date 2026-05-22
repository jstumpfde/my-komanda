// POST /api/platform/emergency/regenerate-ai-prompts
// Защита: X-Platform-Admin-Key. Очищает aiChatbotPrompt у всех вакансий
// с включённым AI-чат-ботом — HR при следующем заходе увидит пустой
// промпт и пересоберёт его.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import {
  emergencyRegenerateAllAiPrompts,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const result = await emergencyRegenerateAllAiPrompts()
    await recordEmergencyAction(
      "regenerate_ai_prompts",
      null,
      result,
      req.headers.get("x-platform-admin-email") ?? undefined,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error("[emergency/regenerate-ai-prompts]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
