// Трекинг-ссылки в постах: на каждый (post, chat) с непустым link_url —
// уникальная короткая ссылка /go/{code}, ведущая на target_url. Клики
// считаются в app/go/[code]/route.ts.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostLinks } from "@/lib/db/schema"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { generateLinkCode } from "./link-code"

const PLACEHOLDER = "{ссылка}"

/**
 * Находит или создаёт telegram_post_links для пары (postId, chatId) с
 * target_url = linkUrl. Возвращает готовую короткую ссылку /go/{code}.
 */
export async function getOrCreatePostLink(postId: string, chatId: string, linkUrl: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(telegramPostLinks)
    .where(and(eq(telegramPostLinks.postId, postId), eq(telegramPostLinks.chatId, chatId)))
    .limit(1)

  if (existing) {
    return `${getAppBaseUrl()}/go/${existing.code}`
  }

  // Коллизия кода технически возможна (8 симв. base62), но крайне маловероятна —
  // на unique-конфликт по code просто перегенерируем и повторим один раз.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLinkCode()
    try {
      const [created] = await db
        .insert(telegramPostLinks)
        .values({ postId, chatId, code, targetUrl: linkUrl })
        .returning()
      return `${getAppBaseUrl()}/go/${created.code}`
    } catch {
      // unique violation (code либо post+chat) — попробуем снова
      const [race] = await db
        .select()
        .from(telegramPostLinks)
        .where(and(eq(telegramPostLinks.postId, postId), eq(telegramPostLinks.chatId, chatId)))
        .limit(1)
      if (race) return `${getAppBaseUrl()}/go/${race.code}`
    }
  }
  throw new Error("Не удалось создать трекинг-ссылку (коллизия кода)")
}

/**
 * Подставляет трекинг-ссылку в текст поста: заменяет плейсхолдер {ссылка},
 * если он есть в тексте, иначе добавляет отдельной строкой в конец.
 */
export function applyLinkToMessage(body: string, trackingUrl: string): string {
  if (body.includes(PLACEHOLDER)) {
    return body.split(PLACEHOLDER).join(trackingUrl)
  }
  return `${body}\n\n${trackingUrl}`
}
