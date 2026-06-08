// Реестр адаптеров каналов. Бизнес-логика обращается ТОЛЬКО сюда, не зная про
// конкретный канал. Новый канал = реализовать ChannelAdapter и добавить в ADAPTERS.

import type { ChannelAdapter, ChannelType } from "./types"
import { telegramAdapter } from "./telegram"
import { emailAdapter } from "./email"

const ADAPTERS: Partial<Record<ChannelType, ChannelAdapter>> = {
  telegram: telegramAdapter,
  email: emailAdapter,
  // widget / whatsapp / max / messenger — добавим адаптерами позже (решение «все каналы»).
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
