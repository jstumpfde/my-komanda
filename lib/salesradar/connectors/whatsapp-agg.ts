// Коннектор WhatsApp через агрегатор (kind='whatsapp_agg'), режим webhook.
// Ядро отделено от провайдер-специфичного маппера (providers/*.ts) — смена
// агрегатора (Wazzup → Pact.im/360dialog/Green-API) = новый файл в
// providers/, это ядро не трогается.
//
// config (открытый): { providerKey: 'wazzup' | ... }
// creds (шифруются): провайдер-специфичные — для wazzup { apiKey }

import type {
  ChannelConnector,
  ConnectorValidationResult,
  NormalizedMessage,
  RawMessage,
} from "../types"
import { WAZZUP_PROVIDER_KEY, wazzupNormalize, wazzupParseWebhook, wazzupValidate, type WazzupCreds } from "./providers/wazzup"

interface WhatsappAggConfig {
  providerKey?: string
}

function providerKeyFrom(config: unknown): string {
  const key = (config as WhatsappAggConfig | null)?.providerKey
  return key || WAZZUP_PROVIDER_KEY // Wazzup — дефолт и единственный реализованный в Ф1 (см. разведку рынка)
}

export const whatsappAggConnector: ChannelConnector = {
  kind: "whatsapp_agg",
  capabilities: { pull: false, webhook: true, send: false },

  async validate(config, creds): Promise<ConnectorValidationResult> {
    const providerKey = providerKeyFrom(config)
    if (providerKey === WAZZUP_PROVIDER_KEY) {
      const cr = (creds || {}) as Partial<WazzupCreds>
      if (!cr.apiKey) return { ok: false, error: "Wazzup: не указан apiKey" }
      return wazzupValidate(cr.apiKey)
    }
    return { ok: false, error: `Провайдер WhatsApp "${providerKey}" не реализован (Ф1 поддерживает только wazzup)` }
  },

  async handleWebhook(payload, connector): Promise<RawMessage[]> {
    const providerKey = providerKeyFrom(connector.config)
    if (providerKey === WAZZUP_PROVIDER_KEY) {
      return wazzupParseWebhook(payload)
    }
    return [] // неизвестный провайдер — не роняем вебхук, просто ничего не извлекаем
  },

  normalize(raw: RawMessage): NormalizedMessage {
    const provider = (raw as { __provider?: string } | null)?.__provider
    if (provider === WAZZUP_PROVIDER_KEY) return wazzupNormalize(raw)
    throw new Error(`whatsapp-agg.normalize: неизвестный провайдер в raw-сообщении: ${provider}`)
  },
}
