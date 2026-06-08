// Публичный webhook приёма входящих Telegram-сообщений для модуля продаж.
//
// Telegram шлёт апдейты POST-ом на per-account URL. accountId в пути определяет
// тенант+аккаунт; секрет в заголовке X-Telegram-Bot-Api-Secret-Token верифицирует
// источник (задаётся при setWebhook). Роут: принять → сохранить входящее → быстро
// вернуть 200, а ответ бота посчитать ФОНОМ (handleConversationTurn без await),
// чтобы Telegram не ретраил из-за задержек/таймингов.
//
// Middleware пропускает все /api/ насквозь — auth здесь через webhookSecret.

import { NextRequest, NextResponse } from "next/server"
import { getChannelAccountById } from "@/lib/channels/resolve"
import { getChannelAdapter } from "@/lib/channels/index"
import { recordInbound } from "@/lib/sales/conversations"
import { handleConversationTurn } from "@/lib/sales/handle-turn"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params

  const account = await getChannelAccountById(accountId)
  if (!account || account.channel !== "telegram" || account.isActive === false) {
    // Не раскрываем детали несуществующего/чужого аккаунта — просто 404.
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  // Верификация секрета (если задан при подключении вебхука).
  if (account.webhookSecret) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token")
    if (provided !== account.webhookSecret) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    // Битый body — игнорируем, но 200, чтобы Telegram не ретраил бесконечно.
    return NextResponse.json({ ok: true })
  }

  const adapter = getChannelAdapter("telegram")
  if (!adapter) return NextResponse.json({ ok: true })

  const inbound = adapter.parseInbound(payload)
  for (const msg of inbound) {
    msg.toAccount = accountId
    try {
      const conversation = await recordInbound(account, msg)
      // Текстовое сообщение → обрабатываем ход диалога ФОНОМ (без await).
      // Нажатия кнопок (callbackData без текста) пока не обрабатываем — Спринт 3 (слоты).
      if (msg.text && msg.text.trim()) {
        void handleConversationTurn(conversation, msg.text).catch((err) =>
          console.error("[sales:telegram-webhook] turn failed:", err),
        )
      }
    } catch (err) {
      console.error("[sales:telegram-webhook] recordInbound failed:", err)
      // Продолжаем — один сбойный апдейт не должен ронять весь приём.
    }
  }

  // Telegram требует быстрый 200, иначе будет ретраить апдейт.
  return NextResponse.json({ ok: true })
}
