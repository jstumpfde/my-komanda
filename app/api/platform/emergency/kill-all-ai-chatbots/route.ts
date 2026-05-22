// POST /api/platform/emergency/kill-all-ai-chatbots
// Защита: X-Platform-Admin-Key. Ставит companies.ai_chatbot_killed = true
// у всех компаний — мгновенно блокирует обработку входящих сообщений AI.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import {
  emergencyKillAllAiChatbots,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const result = await emergencyKillAllAiChatbots()
    await recordEmergencyAction(
      "kill_all_ai_chatbots",
      null,
      result,
      req.headers.get("x-platform-admin-email") ?? undefined,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error("[emergency/kill-all-ai-chatbots]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
