// lib/tip/bot/users.ts
// Идентификация пользователя модуля «Типология» в Telegram-боте — по
// chat_id (tip_users.tg_chat_id, уникальный, см. lib/db/schema.ts). Аналог
// getOrCreateTipUser() (lib/tip/session.ts, cookie-based для веба), но без
// cookies() — бот общается вне HTTP-сессии браузера.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipUsers, type TipUser } from "@/lib/db/schema"

/**
 * Возвращает (создавая при необходимости) пользователя модуля «Типология»
 * для данного Telegram chat_id. Idempotent — onConflictDoNothing на
 * tg_chat_id, повторный /start не плодит дублей.
 */
export async function getOrCreateTipUserByChatId(chatId: number): Promise<TipUser> {
  const [existing] = await db.select().from(tipUsers).where(eq(tipUsers.tgChatId, chatId)).limit(1)
  if (existing) return existing

  // ip_hash не проставляем — Telegram Bot API не отдаёт IP пользователя,
  // остаётся null (антифрод 0263 по ip_hash просто не сработает для ботовых
  // пользователей, для них есть отдельная защита по tg_chat_id).
  const [created] = await db
    .insert(tipUsers)
    .values({ tgChatId: chatId })
    .onConflictDoNothing({ target: tipUsers.tgChatId })
    .returning()

  if (created) return created

  // Гонка (два апдейта почти одновременно) — строка уже создана параллельным
  // запросом, читаем её.
  const [row] = await db.select().from(tipUsers).where(eq(tipUsers.tgChatId, chatId)).limit(1)
  if (!row) {
    // Не должно происходить, но не молчим — по контракту функция всегда
    // возвращает TipUser.
    throw new Error(`[tip-bot] не удалось создать/найти пользователя для chat_id=${chatId}`)
  }
  return row
}
