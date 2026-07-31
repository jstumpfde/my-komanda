// Коннектор Telegram Bot API (kind='telegram_bot'), режим webhook.
// Ф1: бот добавлен в рабочие группы/чаты компании — легальный способ читать
// коммуникацию без риска блокировки (в отличие от MTProto-юзерботов, см.
// разведку рынка). Личные диалоги менеджеров — kind='telegram_user', Ф2,
// за фичефлагом.
//
// creds (шифруются): { botToken }
// config (открытый): {} — зарезервировано под allowlist чатов в Ф2
// webhookSecret (отдельная колонка) — сверяется с заголовком
// X-Telegram-Bot-Api-Secret-Token на входящем вебхуке (см. webhook route).

import type {
  ChannelConnector,
  ConnectorValidationResult,
  NormalizedMessage,
  RawMessage,
} from "../types"

export interface TelegramBotCreds {
  botToken: string
}

interface TelegramRawMessage {
  __connector: "telegram_bot"
  chatId: number
  messageId: number
  fromId?: number
  fromName?: string
  isBot?: boolean
  text: string
  date: number // unix seconds
}

const TELEGRAM_API = "https://api.telegram.org"

function asCreds(creds: unknown): TelegramBotCreds {
  const c = (creds || {}) as Partial<TelegramBotCreds>
  if (!c.botToken) throw new Error("Telegram: не указан botToken")
  return { botToken: c.botToken }
}

/** getMe — минимальная проверка валидности токена без побочных эффектов. */
export async function telegramGetMe(botToken: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`)
    const json = await res.json()
    if (!json.ok) return { ok: false, error: json.description || "Telegram API вернул ok:false" }
    return { ok: true, username: json.result?.username }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Регистрирует webhook у Telegram (setWebhook). Вызывается из API создания/
 * обновления коннектора (app/api/modules/ai-rop/connectors), не из
 * ChannelConnector — это операция настройки, не часть ingest-контракта.
 */
export async function telegramSetWebhook(botToken: string, url: string, secretToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message", "edited_message"] }),
    })
    const json = await res.json()
    if (!json.ok) return { ok: false, error: json.description || "setWebhook вернул ok:false" }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export const telegramBotConnector: ChannelConnector = {
  kind: "telegram_bot",
  capabilities: { pull: false, webhook: true, send: false },

  async validate(_config, creds): Promise<ConnectorValidationResult> {
    try {
      const cr = asCreds(creds)
      const result = await telegramGetMe(cr.botToken)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, accountLabel: result.username ? `@${result.username}` : "Telegram-бот" }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async handleWebhook(payload): Promise<RawMessage[]> {
    const update = payload as {
      message?: {
        message_id: number
        date: number
        chat: { id: number }
        from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }
        text?: string
        caption?: string
      }
      edited_message?: unknown
    }
    const msg = update.message
    if (!msg) return [] // edited_message/прочие апдейты в Ф1 игнорируем
    const text = msg.text ?? msg.caption
    if (!text) return [] // не-текстовые сообщения (стикеры/фото без подписи) в Ф1 пропускаем

    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username

    const raw: TelegramRawMessage = {
      __connector: "telegram_bot",
      chatId: msg.chat.id,
      messageId: msg.message_id,
      fromId: msg.from?.id,
      fromName,
      isBot: msg.from?.is_bot,
      text,
      date: msg.date,
    }
    return [raw]
  },

  normalize(raw: RawMessage): NormalizedMessage {
    const m = raw as TelegramRawMessage
    return {
      externalId: `${m.chatId}:${m.messageId}`,
      threadKey: String(m.chatId),
      direction: m.isBot ? "out" : "in",
      author: { externalId: m.fromId != null ? String(m.fromId) : undefined, name: m.fromName, isOurs: !!m.isBot },
      text: m.text,
      attachments: [],
      sentAt: new Date(m.date * 1000),
      identityHints: { tgUserId: m.fromId != null ? String(m.fromId) : undefined },
    }
  },
}
