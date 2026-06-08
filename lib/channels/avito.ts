// Адаптер Авито Messenger API под интерфейс lib/channels/types.ts.
//
// СТАТУС: Скелет-заглушка (фаза 1). Реальных сетевых вызовов НЕ делает.
//
// Guard: адаптер возвращает { ok: false, skipped: true, reason: "not_configured" }
// пока не выполнены ВСЕ условия:
//   1. env AVITO_CLIENT_ID + AVITO_CLIENT_SECRET заданы (ключи тенанта или платформы)
//   2. avitoEnabled=true в конфиге компании (companies.hiring_defaults_json)
//   3. В ChannelCredentials передан accessToken (достаётся из avito_integrations)
//
// ─── Фаза 2 (TODO) ───────────────────────────────────────────────────────────
//  - OAuth client_credentials flow: получение access_token через
//    POST https://api.avito.ru/token (docs: developers.avito.ru/api/messenger)
//  - OAuth authorization_code (партнёрский флоу): регистрация приложения у Авито,
//    кнопка «Подключить Авито» в HR → Настройки → Интеграции.
//  - Webhook-роут для приёма входящих: POST /api/webhooks/avito
//    (регистрируется через POST https://api.avito.ru/messenger/v1/webhooks).
//  - Реальный send: POST https://api.avito.ru/messenger/v1/accounts/{user_id}/chats/{chat_id}/messages
//  - Реальный parseInbound: разбор Avito webhook update (тип message / read / typing).
//  - sendTyping: POST .../chats/{chat_id}/typing (если поддерживается).

import { sanitizeOutbound } from "./policy"
import type {
  ChannelAdapter,
  ChannelCredentials,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from "./types"

// Базовый URL Авито API. Задаётся через env для тестовых сред.
// Документация: https://developers.avito.ru/api/messenger
const AVITO_API_BASE =
  process.env.AVITO_API_BASE || "https://api.avito.ru"

/**
 * Проверяет, что адаптер настроен достаточно для реальных вызовов.
 * Требования:
 *  - AVITO_CLIENT_ID и AVITO_CLIENT_SECRET в env (ключи OAuth-приложения)
 *  - accessToken в ChannelCredentials (токен тенанта, достаётся из avito_integrations)
 */
function isConfigured(creds: ChannelCredentials): boolean {
  const hasEnvKeys =
    Boolean(process.env.AVITO_CLIENT_ID?.trim()) &&
    Boolean(process.env.AVITO_CLIENT_SECRET?.trim())
  const hasToken = Boolean(creds.accessToken?.trim())
  return hasEnvKeys && hasToken
}

export const avitoAdapter: ChannelAdapter = {
  type: "messenger", // ChannelType — используем "messenger" как тип Авито Messenger API
  supportsButtons: false, // TODO: уточнить, поддерживает ли Авито кнопки в Messenger API

  async send(creds: ChannelCredentials, message: OutboundMessage): Promise<SendResult> {
    // Guard: без конфигурации — no-op, не делать сетевых вызовов.
    if (!isConfigured(creds)) {
      return { ok: false, skipped: true, reason: "not_configured" }
    }

    if (!message.to?.trim()) {
      return { ok: false, skipped: true, reason: "no_recipient" }
    }
    if (!message.text?.trim()) {
      return { ok: false, skipped: true, reason: "empty_message" }
    }

    // Прогоняем текст через политику канала Авито.
    const sanitized = sanitizeOutbound("avito", message.text)
    if (sanitized.blocked) {
      console.warn(
        "[channel:avito] сообщение заблокировано политикой канала:",
        sanitized.reasons,
      )
      return {
        ok: false,
        skipped: true,
        reason: "blocked_by_policy",
        error: sanitized.reasons.join("; "),
      }
    }
    if (sanitized.reasons.length > 0) {
      console.warn(
        "[channel:avito] текст отредактирован политикой канала:",
        sanitized.reasons,
      )
    }

    // TODO (фаза 2): реальный вызов Авито Messenger API.
    // Формат: POST {AVITO_API_BASE}/messenger/v1/accounts/{userId}/chats/{chatId}/messages
    // Тело: { message: { text: sanitized.text } }
    // Authorization: Bearer {creds.accessToken}
    // Документация: https://developers.avito.ru/api/messenger#operation/sendMessage
    //
    // Пример заготовки (раскомментировать в фазе 2):
    //
    // const [userId, chatId] = message.to.split(":")
    // const res = await fetch(
    //   `${AVITO_API_BASE}/messenger/v1/accounts/${userId}/chats/${chatId}/messages`,
    //   {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/json",
    //       Authorization: `Bearer ${creds.accessToken}`,
    //     },
    //     body: JSON.stringify({ message: { text: sanitized.text } }),
    //   },
    // )
    // if (!res.ok) {
    //   const errText = await res.text().catch(() => "")
    //   console.warn(`[channel:avito] send failed status=${res.status} body=${errText.slice(0, 200)}`)
    //   return { ok: false, error: errText || `status_${res.status}` }
    // }
    // const data = await res.json().catch(() => null)
    // return { ok: true, externalMessageId: data?.id?.toString() }

    // Фаза 1: возвращаем заглушку
    console.warn("[channel:avito] send: реальный вызов API не реализован (фаза 2)")
    return { ok: false, skipped: true, reason: "not_implemented" }
  },

  parseInbound(_payload: unknown): InboundMessage[] {
    // TODO (фаза 2): разбор Avito webhook update.
    // Структура webhook описана на https://developers.avito.ru/api/messenger#webhook
    // Поля: type ("message" | "read" | "typing"), user_id, chat_id, content.text и т.п.
    //
    // Пример заготовки:
    //
    // const update = _payload as AvitoWebhookUpdate
    // if (update?.payload?.value?.content?.text) {
    //   return [{
    //     channel: "messenger",
    //     toAccount: String(update.payload.value.user_id ?? ""),
    //     from: String(update.payload.value.chat_id ?? ""),
    //     fromName: update.payload.value.author_id?.toString(),
    //     text: update.payload.value.content.text,
    //     raw: _payload,
    //   }]
    // }
    return []
  },

  async sendTyping(_creds: ChannelCredentials, _to: string): Promise<void> {
    // TODO (фаза 2): POST {AVITO_API_BASE}/messenger/v1/accounts/{userId}/chats/{chatId}/typing
    // Пока молча игнорируем — не критично.
  },
}

// ─── Вспомогательная функция: получить access_token через client_credentials ──
//
// TODO (фаза 2): реализовать и кэшировать токен (expires_in ~ 24ч по docs Авито).
// Хранить token + expires_at в avito_integrations, обновлять при истечении.
//
// export async function refreshAvitoToken(
//   clientId: string,
//   clientSecret: string,
// ): Promise<{ access_token: string; expires_in: number }> {
//   const res = await fetch(`${AVITO_API_BASE}/token`, {
//     method: "POST",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: clientId,
//       client_secret: clientSecret,
//     }),
//   })
//   if (!res.ok) throw new Error(`[avito] token refresh failed: ${res.status}`)
//   return res.json()
// }
