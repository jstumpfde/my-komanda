import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { isValidTelegramChatId } from "@/lib/business-assistant/flights/watch-notify"

// POST — отправляет короткое тестовое сообщение на указанный chat_id, чтобы
// пользователь мог проверить связку "Отслеживать цену → Telegram" за один
// клик, не дожидаясь падения цены и крона.
export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false, reason: "not_configured" })
  }

  const body = await req.json()
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : ""
  if (!chatId || !isValidTelegramChatId(chatId)) {
    return NextResponse.json({ ok: false, reason: "invalid_chat_id" }, { status: 400 })
  }

  const ok = await sendTelegramAlert(
    chatId,
    "✈️ <b>Company24 — Авиабилеты</b>\nЭто тестовое сообщение. Если вы его видите — отслеживание цены подключено к Telegram.",
  )

  return NextResponse.json({ ok, reason: ok ? undefined : "send_failed" })
}
