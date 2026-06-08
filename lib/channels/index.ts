// Реестр адаптеров каналов. Бизнес-логика обращается ТОЛЬКО сюда, не зная про
// конкретный канал. Новый канал = реализовать ChannelAdapter и добавить в ADAPTERS.

import type { ChannelAdapter, ChannelType } from "./types"
import { telegramAdapter } from "./telegram"
import { emailAdapter } from "./email"
import { avitoAdapter } from "./avito"

const ADAPTERS: Partial<Record<ChannelType, ChannelAdapter>> = {
  telegram: telegramAdapter,
  email: emailAdapter,
  // Авито Messenger API — фаза 2: реальный send + parseInbound реализованы.
  // Guard внутри адаптера: без accessToken в ChannelCredentials → not_configured.
  // Токен получают через getAvitoToken(companyId) из lib/channels/avito.ts.
  messenger: avitoAdapter,
  // widget / whatsapp / max — добавим адаптерами позже.
}

export function getChannelAdapter(channel: ChannelType): ChannelAdapter | null {
  return ADAPTERS[channel] ?? null
}

export function isChannelSupported(channel: ChannelType): boolean {
  return channel in ADAPTERS
}

export function supportedChannels(): ChannelType[] {
  return Object.keys(ADAPTERS) as ChannelType[]
}

export * from "./types"
