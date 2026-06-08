// Адаптер Telegram. Отправка — Bot API sendMessage (поверх существующего паттерна
// lib/telegram/send-to-company.ts, но токен передаётся явно — под per-tenant боты
// салонов). Приём — парсинг Telegram webhook update (текст + нажатия inline-кнопок).

import type {
  ChannelAdapter,
  ChannelCredentials,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from "./types"

// База Telegram API. На серверах, где Telegram заблокирован напрямую (RU),
// задаём TELEGRAM_API_BASE на не-RU прокси (рижский Caddy :8081 → api.telegram.org).
const TELEGRAM_API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org"

function buildReplyMarkup(message: OutboundMessage) {
  if (!message.buttons?.length) return undefined
  // По одной кнопке в ряд — компактно и читаемо в мессенджере.
  return {
    inline_keyboard: message.buttons.map((b) => [{ text: b.label, callback_data: b.value }]),
  }
}

export const telegramAdapter: ChannelAdapter = {
  type: "telegram",
  supportsButtons: true,

  async sendTyping(creds: ChannelCredentials, to: string): Promise<void> {
    const token = creds.botToken?.trim()
    if (!token || !to?.trim()) return
    try {
      await fetch(`${TELEGRAM_API}/bot${token}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: to, action: "typing" }),
      })
    } catch {
      // индикатор «печатает…» не критичен — молча игнорируем
    }
  },

  async send(creds: ChannelCredentials, message: OutboundMessage): Promise<SendResult> {
    const token = creds.botToken?.trim()
    if (!token) return { ok: false, skipped: true, reason: "not_configured" }
    if (!message.to?.trim()) return { ok: false, skipped: true, reason: "no_recipient" }
    if (!message.text?.trim()) return { ok: false, skipped: true, reason: "empty_message" }

    const parseMode = message.parseMode === "plain" ? undefined : message.parseMode ?? "HTML"
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.to,
          text: message.text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
          reply_markup: buildReplyMarkup(message),
        }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.warn(`[channel:telegram] send failed status=${res.status} body=${errText.slice(0, 200)}`)
        return { ok: false, error: errText || `status_${res.status}` }
      }
      const data = (await res.json().catch(() => null)) as { result?: { message_id?: number } } | null
      return { ok: true, externalMessageId: data?.result?.message_id?.toString() }
    } catch (err) {
      console.warn("[channel:telegram] exception:", err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  parseInbound(payload: unknown): InboundMessage[] {
    const update = payload as TelegramUpdate
    if (!update || typeof update !== "object") return []

    // Обычное текстовое сообщение.
    if (update.message?.text) {
      const msg = update.message
      return [
        {
          channel: "telegram",
          toAccount: "", // заполнит роутер по токену бота, на который пришёл вебхук
          from: String(msg.chat.id),
          fromName: telegramName(msg.from),
          text: msg.text ?? "",
          raw: update,
        },
      ]
    }

    // Нажатие inline-кнопки (выбор слота, отмена/перенос).
    if (update.callback_query) {
      const cq = update.callback_query
      return [
        {
          channel: "telegram",
          toAccount: "",
          from: String(cq.message?.chat.id ?? cq.from.id),
          fromName: telegramName(cq.from),
          text: "",
          callbackData: cq.data,
          raw: update,
        },
      ]
    }

    return []
  },
}

function telegramName(from?: TelegramUser): string | undefined {
  if (!from) return undefined
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim()
  return name || from.username
}

// Минимальные типы Telegram update — только используемые поля.
interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}
interface TelegramChat {
  id: number
}
interface TelegramMessage {
  text?: string
  chat: TelegramChat
  from?: TelegramUser
}
interface TelegramCallbackQuery {
  id: string
  data?: string
  from: TelegramUser
  message?: TelegramMessage
}
interface TelegramUpdate {
  update_id?: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}
