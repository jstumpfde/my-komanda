// Адаптер Авито Messenger API под интерфейс lib/channels/types.ts.
//
// Guard: адаптер возвращает { ok: false, skipped: true, reason: "not_configured" }
// если в ChannelCredentials нет accessToken.
//
// Для получения accessToken используйте getAvitoToken(companyId):
//   - читает кэш из avito_integrations.access_token + token_expires_at
//   - если истёк — запрашивает новый через refreshAvitoToken (client_credentials)
//   - сохраняет в БД и возвращает свежий токен
//
// ─── Формат message.to ────────────────────────────────────────────────────────
// "{userId}:{chatId}" — числовой userId аккаунта Авито + chatId чата.
// userId берётся из avito_integrations.user_id.
//
// ─── TODO (следующий шаг) ────────────────────────────────────────────────────
// - Партнёрский authorization_code-флоу (кнопка «Войти через Авито»):
//   требует регистрации приложения у Авито и redirect URL.
//   Текущий путь: HR вводит client_id/secret вручную (client_credentials).
// - sendTyping: уточнить поддержку в Авито Messenger API.
// - Webhook-регистрация: POST /messenger/v1/webhooks (URL нашего эндпоинта).

import { db } from "@/lib/db"
import { avitoIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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

// Запас по времени перед истечением токена (обновляем заранее).
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // 5 минут

// ─── Интерфейс ответа Авито /token ───────────────────────────────────────────

interface AvitoTokenResponse {
  access_token: string
  token_type:   string
  expires_in:   number // секунд
}

// ─── Тип структуры Авито webhook-апдейта ────────────────────────────────────
// Документация: https://developers.avito.ru/api/messenger#webhook

interface AvitoWebhookUpdate {
  payload?: {
    value?: {
      user_id?:   number
      chat_id?:   string
      author_id?: number
      content?: {
        text?: string
      }
      created?: number // unix timestamp
    }
  }
  type?: string // "message" | "read" | "typing" | etc.
}

// ─── OAuth: получить/обновить токен через client_credentials ─────────────────

/**
 * Запрашивает новый access_token у Авито API.
 * Используется getAvitoToken при истечении кэша.
 *
 * @throws Error если Авито вернул не-200 или невалидный JSON.
 */
export async function refreshAvitoToken(
  clientId: string,
  clientSecret: string,
): Promise<AvitoTokenResponse> {
  const res = await fetch(`${AVITO_API_BASE}/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `[avito] token refresh failed: HTTP ${res.status} — ${text.slice(0, 200)}`,
    )
  }
  return res.json() as Promise<AvitoTokenResponse>
}

/**
 * Возвращает действующий access_token для компании.
 * Читает кэш из avito_integrations; если токен истёк или отсутствует —
 * получает новый через client_credentials и сохраняет в БД.
 *
 * Возвращает null если интеграция не настроена (нет client_id/secret)
 * или выключена (isEnabled=false / isActive=false).
 */
export async function getAvitoToken(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({
      clientId:       avitoIntegrations.clientId,
      clientSecret:   avitoIntegrations.clientSecret,
      accessToken:    avitoIntegrations.accessToken,
      tokenExpiresAt: avitoIntegrations.tokenExpiresAt,
      isEnabled:      avitoIntegrations.isEnabled,
      isActive:       avitoIntegrations.isActive,
    })
    .from(avitoIntegrations)
    .where(eq(avitoIntegrations.companyId, companyId))
    .limit(1)

  if (!row) return null
  if (!row.isEnabled || !row.isActive) return null
  if (!row.clientId?.trim() || !row.clientSecret?.trim()) return null

  // Проверяем кэш
  const now = Date.now()
  if (
    row.accessToken?.trim() &&
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() - now > TOKEN_REFRESH_MARGIN_MS
  ) {
    return row.accessToken
  }

  // Кэш устарел или отсутствует — запрашиваем новый
  try {
    const resp = await refreshAvitoToken(row.clientId, row.clientSecret)
    const expiresAt = new Date(now + resp.expires_in * 1000)

    await db
      .update(avitoIntegrations)
      .set({
        accessToken:    resp.access_token,
        tokenExpiresAt: expiresAt,
        updatedAt:      new Date(),
      })
      .where(eq(avitoIntegrations.companyId, companyId))

    return resp.access_token
  } catch (err) {
    console.error("[channel:avito] token refresh error:", err)
    // Не падаем — возвращаем null, адаптер уйдёт в not_configured
    return null
  }
}

// ─── Адаптер ─────────────────────────────────────────────────────────────────

export const avitoAdapter: ChannelAdapter = {
  type: "messenger",
  supportsButtons: false, // TODO: уточнить поддержку кнопок в Авито Messenger API

  async send(creds: ChannelCredentials, message: OutboundMessage): Promise<SendResult> {
    // Guard: нужен accessToken в creds
    if (!creds.accessToken?.trim()) {
      return { ok: false, skipped: true, reason: "not_configured" }
    }

    if (!message.to?.trim()) {
      return { ok: false, skipped: true, reason: "no_recipient" }
    }
    if (!message.text?.trim()) {
      return { ok: false, skipped: true, reason: "empty_message" }
    }

    // ОБЯЗАТЕЛЬНО: прогоняем текст через политику канала Авито
    const sanitized = sanitizeOutbound("avito", message.text)
    if (sanitized.blocked) {
      console.warn(
        "[channel:avito] сообщение заблокировано политикой канала:",
        sanitized.reasons,
      )
      return {
        ok:      false,
        skipped: true,
        reason:  "blocked_by_policy",
        error:   sanitized.reasons.join("; "),
      }
    }
    if (sanitized.reasons.length > 0) {
      console.warn(
        "[channel:avito] текст отредактирован политикой канала:",
        sanitized.reasons,
      )
    }

    // Формат message.to = "{userId}:{chatId}"
    const colonIdx = message.to.indexOf(":")
    if (colonIdx === -1) {
      return { ok: false, skipped: true, reason: "invalid_recipient_format" }
    }
    const userId = message.to.slice(0, colonIdx)
    const chatId = message.to.slice(colonIdx + 1)

    if (!userId || !chatId) {
      return { ok: false, skipped: true, reason: "invalid_recipient_format" }
    }

    // Реальный вызов Авито Messenger API
    // POST /messenger/v1/accounts/{userId}/chats/{chatId}/messages
    // Документация: https://developers.avito.ru/api/messenger#operation/sendMessage
    const url =
      `${AVITO_API_BASE}/messenger/v1/accounts/${userId}/chats/${chatId}/messages`

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({ message: { text: sanitized.text } }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn(
        `[channel:avito] send failed status=${res.status} body=${errText.slice(0, 200)}`,
      )
      return { ok: false, error: errText || `status_${res.status}` }
    }

    const data = await res.json().catch(() => null) as { id?: string | number } | null
    return {
      ok:                true,
      externalMessageId: data?.id?.toString(),
    }
  },

  parseInbound(payload: unknown): InboundMessage[] {
    // Разбор Авито webhook update.
    // Структура описана на https://developers.avito.ru/api/messenger#webhook
    // Принимаем только тип "message" (не read/typing/etc.)
    const update = payload as AvitoWebhookUpdate

    if (update?.type !== "message") return []

    const val = update?.payload?.value
    if (!val?.content?.text?.trim()) return []

    return [
      {
        channel:   "messenger",
        toAccount: String(val.user_id ?? ""),
        from:      String(val.chat_id ?? ""),
        fromName:  val.author_id?.toString(),
        text:      val.content.text,
        raw:       payload,
      },
    ]
  },

  async sendTyping(_creds: ChannelCredentials, _to: string): Promise<void> {
    // TODO: уточнить поддержку typing-индикатора в Авито Messenger API.
    // POST {AVITO_API_BASE}/messenger/v1/accounts/{userId}/chats/{chatId}/typing
    // Пока молча игнорируем.
  },
}
