// Реестр коннекторов каналов SalesRadar по ConnectorKind + страновой фильтр.
// Единая точка, откуда крон/вебхук-роуты и UI берут реализацию по kind —
// сами роуты не должны импортировать connectors/imap.ts и т.п. напрямую.

import type { ChannelConnector, ConnectorCountry, ConnectorKind } from "../types"
import { imapConnector } from "./imap"
import { telegramBotConnector } from "./telegram-bot"
import { whatsappAggConnector } from "./whatsapp-agg"

const REGISTRY: Partial<Record<ConnectorKind, ChannelConnector>> = {
  imap: imapConnector,
  telegram_bot: telegramBotConnector,
  whatsapp_agg: whatsappAggConnector,
  // telegram_user, vk, avito, bitrix — не реализованы в Ф1 (см. план,
  // раздел D: telegram_user за фичефлагом Ф2, vk/avito/bitrix Ф2).
}

/** Коннекторы, доступные для страны (см. план: РФ = imap/telegram/whatsapp_agg/vk/avito/bitrix, DE = Ф3). */
const COUNTRY_KINDS: Record<ConnectorCountry, ConnectorKind[]> = {
  RU: ["imap", "telegram_bot", "telegram_user", "whatsapp_agg", "vk", "avito", "bitrix"],
  DE: ["imap"], // остальное — Ф3 (M365 Graph/Outlook, Slack, WhatsApp Business API)
}

export function getConnector(kind: ConnectorKind): ChannelConnector | null {
  return REGISTRY[kind] ?? null
}

export function isConnectorImplemented(kind: ConnectorKind): boolean {
  return kind in REGISTRY
}

/** Список kind'ов, реализованных и доступных для страны — то, что показываем в UI выбора канала. */
export function byCountry(country: ConnectorCountry): ConnectorKind[] {
  const allowed = COUNTRY_KINDS[country] ?? []
  return allowed.filter((kind) => kind in REGISTRY)
}

export function listAllConnectors(): { kind: ConnectorKind; connector: ChannelConnector }[] {
  return (Object.keys(REGISTRY) as ConnectorKind[]).map((kind) => ({ kind, connector: REGISTRY[kind]! }))
}
