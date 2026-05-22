// POST /api/platform/emergency/add-stop-word
// Body: { word: string }
// Защита: X-Platform-Admin-Key. Добавляет слово в stop_words_json
// у всех вакансий, где его ещё нет.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import {
  emergencyAddGlobalStopWord,
  recordEmergencyAction,
} from "@/lib/platform/emergency-broadcast"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({} as { word?: unknown }))
    const word = typeof body.word === "string" ? body.word.trim() : ""
    if (!word) {
      return NextResponse.json({ error: "word is required" }, { status: 400 })
    }
    const result = await emergencyAddGlobalStopWord(word)
    await recordEmergencyAction(
      "add_global_stop_word",
      { word },
      result,
      req.headers.get("x-platform-admin-email") ?? undefined,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error("[emergency/add-stop-word]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
