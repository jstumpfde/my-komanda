// Провайдер-маппер Wazzup24 — основной кандидат по разведке рынка
// (salesradar-market-scan.md: самая внятная публичная webhook-документация,
// готовый Bitrix24-коннектор, широкий охват каналов).
//
// ВАЖНО: точная форма JSON webhook-пейлоада Wazzup не была видна напрямую в
// разведке (страница pricing/докс отдала 403 боту-краулеру) — структура ниже
// собрана по описанию в разведке ("messageId, dateTime, channelId, chatType,
// контакт; события по статусам") и по типовому виду webhook API Wazzup
// (`{ messages: [...] }` с набором полей). TODO при реальном подключении клиента:
// свериться с https://wazzup24.com/help/api-en/webhooks/ и поправить парсинг
// по факту первого живого пейлоада — структура парсится defensively
// (optional chaining), так что нетиповые поля просто дадут text=null, а не упадут.
//
// API-ключ Wazzup передаётся в creds.apiKey; validate() дергает
// GET /v3/channels (список каналов) — если ключ валиден, Wazzup отвечает 200.

import type { NormalizedMessage, RawMessage } from "../../types"

export const WAZZUP_PROVIDER_KEY = "wazzup"

export interface WazzupCreds {
  apiKey: string
}

interface WazzupWebhookMessage {
  messageId?: string
  chatId?: string
  chatType?: string // whatsapp|instagram|telegram|viber
  dateTime?: string // ISO
  text?: string
  isEcho?: boolean // true = отправлено нами (из Wazzup или CRM)
  authorName?: string
  contact?: { name?: string; phone?: string }
}

interface WazzupRawMessage {
  __connector: "whatsapp_agg"
  __provider: "wazzup"
  messageId: string
  chatId: string
  text: string
  sentAt: Date
  isOurs: boolean
  authorName?: string
  phone?: string
}

export async function wazzupValidate(apiKey: string): Promise<{ ok: boolean; error?: string; accountLabel?: string }> {
  try {
    const res = await fetch("https://api.wazzup24.com/v3/channels", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      return { ok: false, error: `Wazzup API вернул ${res.status}` }
    }
    const json = await res.json().catch(() => null)
    const count = Array.isArray(json) ? json.length : Array.isArray(json?.data) ? json.data.length : undefined
    return { ok: true, accountLabel: count != null ? `Wazzup, каналов: ${count}` : "Wazzup" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function wazzupParseWebhook(payload: unknown): RawMessage[] {
  const body = payload as { messages?: WazzupWebhookMessage[] } | WazzupWebhookMessage[]
  const list = Array.isArray(body) ? body : body?.messages ?? []
  const out: WazzupRawMessage[] = []
  for (const m of list) {
    if (!m?.text || !m.chatId) continue // без текста (голос/фото без подписи) — Ф1 пропускает
    let sentAt = new Date()
    if (m.dateTime) {
      const parsed = new Date(m.dateTime)
      if (!Number.isNaN(parsed.getTime())) sentAt = parsed
    }
    out.push({
      __connector: "whatsapp_agg",
      __provider: "wazzup",
      messageId: m.messageId || `${m.chatId}:${sentAt.getTime()}`,
      chatId: m.chatId,
      text: m.text,
      sentAt,
      isOurs: !!m.isEcho,
      authorName: m.authorName || m.contact?.name,
      phone: m.contact?.phone,
    })
  }
  return out
}

export function wazzupNormalize(raw: RawMessage): NormalizedMessage {
  const m = raw as WazzupRawMessage
  return {
    externalId: m.messageId,
    threadKey: m.chatId,
    direction: m.isOurs ? "out" : "in",
    author: { name: m.authorName, isOurs: m.isOurs },
    text: m.text,
    attachments: [],
    sentAt: m.sentAt,
    identityHints: { phone: m.phone },
  }
}
