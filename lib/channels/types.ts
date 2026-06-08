// Унифицированный мультиканальный слой доставки сообщений (модуль продаж).
//
// Цель: ОДИН интерфейс отправки/приёма сообщений; конкретные каналы (Telegram,
// email, виджет на сайте, WhatsApp, MAX, Messenger) — подключаемые адаптеры.
// Транспорт НЕ знает про бизнес-логику (квалификацию, запись, дожим) — он только
// доставляет исходящие и нормализует входящие. Бизнес-логика общается с каналами
// исключительно через реестр (lib/channels/index.ts), не зная про конкретный канал.
//
// Решение Юрия 07.06.2026: каналы = ВСЕ, через адаптеры. Первым обкатываем Telegram.

export type ChannelType =
  | "telegram"
  | "email"
  | "widget"
  | "whatsapp"
  | "max"
  | "messenger"

// Реквизиты доступа к каналу для КОНКРЕТНОГО тенанта (салона). Хранятся per-tenant;
// отдельный resolver достаёт их по companyId+channel (см. будущий lib/channels/resolve).
export interface ChannelCredentials {
  // telegram: токен бота салона (per-tenant, как companies.telegramBotToken)
  botToken?: string
  // email: адрес отправителя
  fromAddress?: string
  // общий: внешний идентификатор аккаунта канала (номер WhatsApp, страница и т.п.)
  externalAccountId?: string
  // произвольные доп. поля провайдера
  [key: string]: string | undefined
}

// Исходящее сообщение (бот/менеджер → клиент).
export interface OutboundMessage {
  // Куда внутри канала: telegram chat_id, email address, widget session id.
  to: string
  text: string
  // Интерактивные элементы (кнопки выбора слота, «отменить»/«перенести»).
  // Каналы без поддержки кнопок (email) деградируют до текста.
  buttons?: ChannelButton[]
  // Только email; прочие каналы игнорируют.
  subject?: string
  parseMode?: "HTML" | "Markdown" | "plain"
}

export interface ChannelButton {
  label: string
  // Нагрузка, которая вернётся во входящем как callbackData при нажатии.
  value: string
}

// Входящее сообщение (клиент → мы), нормализованное из webhook канала.
export interface InboundMessage {
  channel: ChannelType
  // На какой аккаунт канала пришло (какой бот/почта) — для маршрутизации к тенанту.
  // Адаптер может не знать его из payload; тогда заполняет роутер по токену вебхука.
  toAccount: string
  // Кто написал (внутри канала): chat_id, email и т.п.
  from: string
  // Отображаемое имя/username, если канал его отдаёт.
  fromName?: string
  text: string
  // Если клиент нажал кнопку — её value (см. ChannelButton.value).
  callbackData?: string
  // Сырой апдейт провайдера — для отладки/аудита.
  raw?: unknown
}

export interface SendResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  error?: string
  // Внешний id отправленного сообщения, если канал его вернул.
  externalMessageId?: string
}

// Контракт адаптера канала. Каждый канал реализует send + parseInbound.
export interface ChannelAdapter {
  type: ChannelType
  // Поддерживает ли канал интерактивные кнопки.
  supportsButtons: boolean
  // Отправить сообщение клиенту. creds — реквизиты тенанта для этого канала.
  send(creds: ChannelCredentials, message: OutboundMessage): Promise<SendResult>
  // Разобрать входящий webhook-апдейт в нормализованные InboundMessage.
  // Возвращает [] если апдейт без сообщения (служебные события).
  parseInbound(payload: unknown): InboundMessage[]
  // Опционально: показать индикатор «печатает…» (Telegram sendChatAction).
  // Каналы без поддержки молча игнорируют (метода нет).
  sendTyping?(creds: ChannelCredentials, to: string): Promise<void>
}
