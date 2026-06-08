// Персистентность диалогов и отправка сообщений через канал.
//
// Этот модуль — центральная точка для:
//   1. Upsert-диалога по (channelAccountId, externalUserId).
//   2. Записи входящих и исходящих сообщений в salesMessages.
//   3. Отправки через адаптер канала с автоматической записью в БД.
//
// Бизнес-логика (квалификатор, дожим и т.п.) обращается только сюда,
// не зная деталей канала или схемы таблиц.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesConversations, salesMessages } from "@/lib/db/schema"
import { getChannelAdapter } from "@/lib/channels/index"
import { getChannelAccountById } from "@/lib/channels/resolve"
import { toCredentials } from "@/lib/channels/resolve"
import type { ChannelType, InboundMessage, OutboundMessage, SendResult } from "@/lib/channels/types"
import type { ChannelAccount } from "@/lib/channels/resolve"

// Тип строки диалога (инферируется из схемы Drizzle).
export type Conversation = typeof salesConversations.$inferSelect

// ─── Upsert диалога ───────────────────────────────────────────────────────────

// Найти существующий диалог по (channelAccountId, externalUserId) или создать
// новый. Если диалог уже есть и пришло новое externalUserName — обновляем.
export async function upsertConversation(params: {
  tenantId: string
  channel: ChannelType
  channelAccountId: string
  externalUserId: string
  externalUserName?: string | null
}): Promise<Conversation> {
  const { tenantId, channel, channelAccountId, externalUserId, externalUserName } = params

  // Попытка найти существующий диалог.
  const [existing] = await db
    .select()
    .from(salesConversations)
    .where(
      and(
        eq(salesConversations.channelAccountId, channelAccountId),
        eq(salesConversations.externalUserId, externalUserId),
      ),
    )
    .limit(1)

  if (existing) {
    // Обновляем имя пользователя, если канал его передал и оно изменилось.
    if (externalUserName && externalUserName !== existing.externalUserName) {
      const [updated] = await db
        .update(salesConversations)
        .set({ externalUserName, updatedAt: new Date() })
        .where(eq(salesConversations.id, existing.id))
        .returning()
      return updated
    }
    return existing
  }

  // Создаём новый диалог.
  const [created] = await db
    .insert(salesConversations)
    .values({
      tenantId,
      channel,
      channelAccountId,
      externalUserId,
      externalUserName: externalUserName ?? null,
      status: "active",
      lastMessageAt: new Date(),
    })
    .returning()

  return created
}

// ─── Запись сообщения ─────────────────────────────────────────────────────────

// Вставить сообщение в salesMessages и обновить lastMessageAt + updatedAt
// в родительском диалоге.
export async function recordMessage(params: {
  tenantId: string
  conversationId: string
  direction: "inbound" | "outbound"
  role: "client" | "bot" | "manager"
  text: string
  callbackData?: string | null
  externalMessageId?: string | null
  raw?: unknown
}): Promise<void> {
  const now = new Date()

  await db.insert(salesMessages).values({
    tenantId:          params.tenantId,
    conversationId:    params.conversationId,
    direction:         params.direction,
    role:              params.role,
    text:              params.text,
    callbackData:      params.callbackData ?? null,
    externalMessageId: params.externalMessageId ?? null,
    raw:               params.raw !== undefined ? (params.raw as Record<string, unknown>) : null,
  })

  // Обновляем временну́ю метку последнего сообщения в диалоге.
  await db
    .update(salesConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(salesConversations.id, params.conversationId))
}

// ─── Комбайн: входящее сообщение ─────────────────────────────────────────────

// Удобный хелпер: upsert-диалога по данным InboundMessage + запись сообщения.
// Возвращает актуальную строку диалога.
export async function recordInbound(
  account: ChannelAccount,
  inbound: InboundMessage,
): Promise<Conversation> {
  const conversation = await upsertConversation({
    tenantId:         account.tenantId,
    channel:          inbound.channel,
    channelAccountId: account.id,
    externalUserId:   inbound.from,
    externalUserName: inbound.fromName ?? null,
  })

  await recordMessage({
    tenantId:       account.tenantId,
    conversationId: conversation.id,
    direction:      "inbound",
    role:           "client",
    text:           inbound.text,
    callbackData:   inbound.callbackData ?? null,
    raw:            inbound.raw,
  })

  return conversation
}

// ─── Отправка в диалог ────────────────────────────────────────────────────────

// Резолвнуть аккаунт канала → взять адаптер → отправить → записать в БД.
// message.to по умолчанию = conversation.externalUserId (если не переопределён).
export async function sendToConversation(
  conversation: Conversation,
  message: OutboundMessage,
  opts?: { role?: "bot" | "manager" },
): Promise<SendResult> {
  // Резолв аккаунта канала.
  const account = await getChannelAccountById(conversation.channelAccountId)
  if (!account) {
    return { ok: false, skipped: true, reason: "channel_account_not_found" }
  }

  // Получить адаптер из реестра.
  const adapter = getChannelAdapter(conversation.channel as ChannelType)
  if (!adapter) {
    return { ok: false, skipped: true, reason: `adapter_not_found:${conversation.channel}` }
  }

  // Если to не задан — используем externalUserId диалога.
  const outbound: OutboundMessage = message.to
    ? message
    : { ...message, to: conversation.externalUserId }

  const creds = toCredentials(account)
  const result = await adapter.send(creds, outbound)

  // Записываем исходящее сообщение только при успешной доставке.
  if (result.ok) {
    await recordMessage({
      tenantId:          conversation.tenantId,
      conversationId:    conversation.id,
      direction:         "outbound",
      role:              opts?.role ?? "bot",
      text:              outbound.text,
      externalMessageId: result.externalMessageId ?? null,
    })
  }

  return result
}

// ─── Перевод диалога на менеджера ────────────────────────────────────────────

// Переключить статус диалога в paused_for_human — бот перестаёт отвечать,
// пока менеджер не возьмёт управление (или не сбросит статус в active).
export async function pauseForHuman(conversationId: string): Promise<void> {
  await db
    .update(salesConversations)
    .set({ status: "paused_for_human", updatedAt: new Date() })
    .where(eq(salesConversations.id, conversationId))
}

// Показать клиенту индикатор «печатает…» (если канал поддерживает).
export async function sendTypingIndicator(conversation: Conversation): Promise<void> {
  const account = await getChannelAccountById(conversation.channelAccountId)
  if (!account) return
  const adapter = getChannelAdapter(conversation.channel as ChannelType)
  if (!adapter?.sendTyping) return
  await adapter.sendTyping(toCredentials(account), conversation.externalUserId)
}

// Отправить сообщение на ПРОИЗВОЛЬНЫЙ чат через тот же канал/бот диалога
// (для уведомлений салону: мастеру/владельцу в их Telegram-чат).
export async function sendViaConversationChannel(
  conversation: Conversation,
  to: string,
  text: string,
): Promise<SendResult> {
  const account = await getChannelAccountById(conversation.channelAccountId)
  if (!account) return { ok: false, skipped: true, reason: "no_account" }
  const adapter = getChannelAdapter(conversation.channel as ChannelType)
  if (!adapter) return { ok: false, skipped: true, reason: "no_adapter" }
  return adapter.send(toCredentials(account), { to, text, parseMode: "plain" })
}
