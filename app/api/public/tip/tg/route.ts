// app/api/public/tip/tg/route.ts
// Webhook Telegram-бота модуля «Типология». Отдельный бот от кандидатского
// (app/api/telegram/candidate-bot/webhook/route.ts) — свой токен
// TIP_TG_BOT_TOKEN + свой секрет TIP_TG_WEBHOOK_SECRET (проверяется в
// заголовке X-Telegram-Bot-Api-Secret-Token, тот же принцип, что у
// кандидатского бота).
//
// Токена в env пока нет — роут отвечает 503 и НЕ падает при импорте (все
// импорты в этом файле и в lib/tip/bot/** module-side-effect-free).
//
// Идемпотентность: dedupe по update_id — см. lib/tip/bot/sessions.ts
// (isDuplicateUpdate/markUpdateProcessed), хранится в tip_tg_sessions.data_json.
//
// Обработка выполняется ДО ответа (лёгкая — шаги мастера это несколько
// запросов в БД + один-два вызова Bot API), но САМА ГЕНЕРАЦИЯ разбора —
// detached-поллинг (lib/tip/bot/flow.ts → pollAndDeliver), не блокирует
// ответ Telegram.

import { NextRequest, NextResponse } from "next/server"
import { handleTextMessage, handleCallbackQuery } from "@/lib/tip/bot/flow"
import { isDuplicateUpdate, markUpdateProcessed } from "@/lib/tip/bot/sessions"

export const runtime = "nodejs"

interface TgChat {
  id: number
}
interface TgMessage {
  message_id: number
  chat: TgChat
  text?: string
}
interface TgCallbackQuery {
  id: string
  data?: string
  message?: TgMessage
}
interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

export async function POST(req: NextRequest) {
  const botToken = process.env.TIP_TG_BOT_TOKEN
  const webhookSecret = process.env.TIP_TG_WEBHOOK_SECRET

  if (!botToken || !webhookSecret) {
    // Токен ещё не выдан/не настроен — отвечаем 503, НЕ падаем.
    return NextResponse.json({ ok: false, error: "bot_not_configured" }, { status: 503 })
  }

  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (incomingSecret !== webhookSecret) {
    return NextResponse.json({ ok: false, error: "bad_secret" }, { status: 403 })
  }

  let update: TgUpdate
  try {
    update = (await req.json()) as TgUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id
  if (!chatId) {
    return NextResponse.json({ ok: true })
  }

  // Dedupe: Telegram ретраит апдейт, если наш ответ не пришёл вовремя.
  const alreadyProcessed = await isDuplicateUpdate(chatId, update.update_id).catch(() => false)
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true })
  }

  try {
    if (update.callback_query) {
      const cq = update.callback_query
      const messageId = cq.message?.message_id
      if (messageId && cq.data) {
        await handleCallbackQuery(botToken, chatId, messageId, cq.id, cq.data)
      }
    } else if (update.message && typeof update.message.text === "string") {
      await handleTextMessage(botToken, chatId, update.message.text)
    }
    await markUpdateProcessed(chatId, update.update_id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tip-bot] webhook handler error", e)
    // Всё равно отвечаем 200 — иначе Telegram будет ретраить бесконечно.
  }

  return NextResponse.json({ ok: true })
}
