// SalesRadar — типы-контракт для коннекторов и атрибуции (Фаза 1, шаг 1).
// Заморожено намеренно: следующие агенты (коннекторы IMAP/Telegram/WhatsApp,
// attribution.ts, UI) работают против этого файла параллельно.
// Полная архитектура — раздел C плана SalesRadar (см. handoff в памяти).
//
// Соответствие таблицам БД (lib/db/schema.ts, блок "SalesRadar"):
//   rop_channel_connectors → RopChannelConnector (Drizzle)
//   rop_messages           → RopMessage (Drizzle), см. NormalizedMessage ниже
//   rop_counterparties / rop_counterparty_identities
//   rop_deal_threads / rop_message_deal_links / rop_deal_facts
//
// Этот файл не импортирует Drizzle-типы напрямую (коннекторы не должны
// знать о схеме БД) — только доменные типы для normalize()/pull()/webhook().

export type ConnectorKind =
  | "imap"
  | "telegram_bot"
  | "telegram_user"
  | "whatsapp_agg"
  | "vk"
  | "avito"
  | "bitrix"

export type ConnectorMode = "pull" | "webhook"

export type ConnectorCountry = "RU" | "DE"

export type MessageDirection = "in" | "out"

/** Подсказки для склейки контрагента по идентичности (см. rop_counterparty_identities.kind). */
export interface IdentityHints {
  phone?: string // сырое значение — normalizePhone() применяется в identity.ts, не в коннекторе
  email?: string
  tgUserId?: string
  tgUsername?: string
  waJid?: string
  vkId?: string
  avitoChatId?: string
  bitrixContactId?: string
}

/** Вложение сообщения — в Ф1 только метаданные, без скачивания контента. */
export interface MessageAttachment {
  name?: string
  sizeBytes?: number
  mimeType?: string
  url?: string
}

/** Сырое сообщение, как его отдаёт канал — до нормализации. Форма зависит от коннектора. */
export type RawMessage = unknown

/**
 * Сообщение после normalize() — общий контракт для всех каналов.
 * Записывается в rop_messages (ingest.ts делает identity resolution по
 * identityHints → counterpartyId, идемпотентность по (connectorId, externalId)).
 */
export interface NormalizedMessage {
  externalId: string
  threadKey: string
  direction: MessageDirection | null
  author: {
    externalId?: string
    name?: string
    isOurs: boolean
  }
  text: string | null
  attachments: MessageAttachment[]
  sentAt: Date
  identityHints: IdentityHints
}

/** Результат validate() при подключении/проверке коннектора в UI. */
export interface ConnectorValidationResult {
  ok: boolean
  error?: string
  accountLabel?: string
}

/** Контекст, передаваемый в pull() — курсор берётся/возвращается через cursorJson коннектора. */
export interface ConnectorPullContext {
  companyId: string
  connectorId: string
  cursor: unknown
  budgetMs: number // бюджет времени крона (по образцу ai-rop-import), pull должен уложиться и вернуть частичный курсор
}

export interface ConnectorPullResult {
  messages: RawMessage[]
  cursor: unknown
}

/**
 * Единый интерфейс коннектора канала. Реализации — lib/salesradar/connectors/*.ts
 * (imap.ts, telegram-bot.ts, whatsapp-agg.ts + providers/* для WhatsApp-агрегаторов).
 * Регистрируются в connectors/registry.ts под ключом ConnectorKind.
 */
export interface ChannelConnector {
  kind: ConnectorKind
  capabilities: {
    pull: boolean
    webhook: boolean
    send: boolean // Ф3
  }
  validate(config: unknown, creds: unknown): Promise<ConnectorValidationResult>
  pull?(ctx: ConnectorPullContext): Promise<ConnectorPullResult>
  handleWebhook?(payload: unknown, connector: { id: string; companyId: string; config: unknown }): Promise<RawMessage[]>
  normalize(raw: RawMessage, connector: { id: string; companyId: string; kind: ConnectorKind }): NormalizedMessage
  send?(threadKey: string, text: string): Promise<void> // Ф3
}

// ---- Атрибуция (attribution.ts, раздел B плана) ----

export type AttributionMethod =
  | "crm_explicit"
  | "sticky"
  | "heuristic_single_open"
  | "ai"
  | "manual"

export type AttributionOutcome =
  | { kind: "linked"; dealThreadId: string; confidence: number; method: AttributionMethod; evidence?: string }
  | { kind: "new_deal"; confidence: number; proposedTitle?: string; evidence?: string }
  | { kind: "small_talk"; confidence: number }
  | { kind: "unclear"; confidence: number }

/** Компактный профиль сделки-нити для AI-матчинга (rop_deal_threads.profileJson). */
export interface DealThreadProfile {
  products: string[]
  keyPhrases: string[] // top-20 по частоте
  participants: string[]
  amounts: string[]
  objects: string[] // адрес/артикул/номер заказа
  aliases: string[]
  lastSnippets: string[] // до 3 последних сообщений нити
}

/** Инкрементальный patch профиля — мержится в profileJson без полного пересчёта. */
export type DealThreadProfilePatch = Partial<DealThreadProfile>
