// GET /api/modules/ai-rop/reports/chats — список диалогов Bitrix-бота (для
// селектора получателя в форме расписания отчётов). Best-effort: пустой
// массив вместо ошибки, если Bitrix не подключён/недоступен. Доступ: requireRopTeam.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { listBotChats } from "@/lib/ai-rop/bitrix-im"

export async function GET() {
  try {
    const user = await requireRopTeam()
    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return NextResponse.json({ ok: true, items: [] })

    const client = createBitrixClient(bitrixConfig)
    const items = await listBotChats(client)
    return NextResponse.json({ ok: true, items })
  } catch (err) {
    if (err instanceof Response) return err
    console.warn("[ai-rop/reports/chats] GET error:", err)
    return NextResponse.json({ ok: true, items: [] })
  }
}
