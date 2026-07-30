// POST /api/modules/ai-rop/reports/chats/validate — проверить что чат существует
// и доступен вебхуку. Body: { chatId: string } ("chatN" или просто "N").
// Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { validateChatId } from "@/lib/ai-rop/bitrix-im"

export async function POST(req: Request) {
  try {
    const user = await requireRopTeam()
    const body = (await req.json().catch(() => ({}))) as { chatId?: unknown }
    const chatId = typeof body.chatId === "string" ? body.chatId : ""
    if (!chatId.trim()) return apiError("Введите ID чата", 400)

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const r = await validateChatId(client, chatId)
    return NextResponse.json(r)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/reports/chats/validate] error:", err)
    return apiError("Internal server error", 500)
  }
}
