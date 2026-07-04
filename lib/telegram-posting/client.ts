// Фабрика GramJS TelegramClient для userbot-аккаунта владельца платформы.
// СЕРВЕРНЫЙ модуль — никогда не импортировать из client components (GramJS
// не рассчитан на браузерный бандл; пакет "server-only" не используем, т.к.
// разрешён только один новый npm-пакет — "telegram").

import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramUserbotSessions } from "@/lib/db/schema"
import { decryptSessionString } from "./crypto"

export function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiIdRaw = process.env.TELEGRAM_API_ID
  const apiHash = process.env.TELEGRAM_API_HASH
  if (!apiIdRaw || !apiHash) {
    throw new Error(
      "TELEGRAM_API_ID / TELEGRAM_API_HASH не заданы в env — получить на https://my.telegram.org/apps"
    )
  }
  const apiId = Number(apiIdRaw)
  if (!Number.isFinite(apiId)) {
    throw new Error("TELEGRAM_API_ID должен быть числом")
  }
  return { apiId, apiHash }
}

/** Клиент с ПУСТОЙ сессией — для старта логина (шаг 1). */
export function createEmptySessionClient(): TelegramClient {
  const { apiId, apiHash } = getApiCredentials()
  return new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 3 })
}

/** Клиент из произвольной (расшифрованной) строки сессии — для шагов логина 2/3. */
export function createClientFromSessionString(sessionString: string): TelegramClient {
  const { apiId, apiHash } = getApiCredentials()
  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 3 })
}

/**
 * Достаёт АКТИВНУЮ сессию пользователя из БД, коннектит клиента и возвращает его.
 * Вызывающий ОБЯЗАН сделать client.disconnect() в finally.
 */
export async function getActiveClient(userId: string): Promise<TelegramClient> {
  const [row] = await db
    .select()
    .from(telegramUserbotSessions)
    .where(eq(telegramUserbotSessions.userId, userId))
    .limit(1)

  if (!row || row.status !== "active" || !row.sessionString) {
    throw new Error("Telegram-аккаунт не подключён (нет активной сессии)")
  }

  const sessionString = decryptSessionString(row.sessionString)
  const client = createClientFromSessionString(sessionString)
  await client.connect()
  return client
}
