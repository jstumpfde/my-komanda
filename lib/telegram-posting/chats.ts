// Синхронизация списка диалогов (группы/каналы/личка) из Telegram-аккаунта
// владельца платформы в реестр telegram_posting_chats.

import { eq, and, lt, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostingChats, telegramUserbotSessions } from "@/lib/db/schema"
import { getActiveClient } from "./client"

const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 часов — не только по кнопке

type ChatType = "group" | "channel" | "user"

function resolveType(d: { isUser: boolean; isChannel: boolean; isGroup: boolean }): ChatType {
  if (d.isUser) return "user"
  if (d.isChannel) return "channel"
  return "group"
}

export async function syncChats(userId: string): Promise<{ synced: number; total: number }> {
  const client = await getActiveClient(userId)
  try {
    const dialogs = await client.getDialogs({ limit: 200 })

    let synced = 0
    for (const d of dialogs) {
      const peerId = d.id?.toString()
      if (!peerId) continue

      const type = resolveType(d)
      const title = d.title || d.name || "Без названия"
      const entity = d.entity as { accessHash?: unknown } | undefined
      const accessHash = entity?.accessHash != null ? String(entity.accessHash) : null

      const [existing] = await db
        .select({ id: telegramPostingChats.id })
        .from(telegramPostingChats)
        .where(and(eq(telegramPostingChats.userId, userId), eq(telegramPostingChats.tgPeerId, peerId)))
        .limit(1)

      if (existing) {
        await db
          .update(telegramPostingChats)
          .set({ title, type, accessHash, updatedAt: new Date() })
          .where(eq(telegramPostingChats.id, existing.id))
      } else {
        await db.insert(telegramPostingChats).values({
          userId,
          tgPeerId: peerId,
          accessHash,
          title,
          type,
        })
      }
      synced++
    }

    return { synced, total: dialogs.length }
  } finally {
    await client.disconnect().catch(() => {})
  }
}

export interface AutoSyncResult {
  sessionsSynced: number
  errors: number
}

/** Пересинк чатов для активных сессий, которые не синкались >6ч — не только
 * по ручной кнопке «Обновить список чатов». Вызывается из cron-тика. */
export async function autoSyncStaleChatsForAllActiveSessions(): Promise<AutoSyncResult> {
  const staleBefore = new Date(Date.now() - AUTO_SYNC_INTERVAL_MS)
  const sessions = await db
    .select({ userId: telegramUserbotSessions.userId })
    .from(telegramUserbotSessions)
    .where(
      and(
        eq(telegramUserbotSessions.status, "active"),
        or(isNull(telegramUserbotSessions.chatsLastSyncedAt), lt(telegramUserbotSessions.chatsLastSyncedAt, staleBefore))
      )
    )

  const result: AutoSyncResult = { sessionsSynced: 0, errors: 0 }
  for (const s of sessions) {
    try {
      await syncChats(s.userId)
      await db
        .update(telegramUserbotSessions)
        .set({ chatsLastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(telegramUserbotSessions.userId, s.userId))
      result.sessionsSynced++
    } catch (err) {
      console.error("[chats] auto-sync failed for user", s.userId, err)
      result.errors++
    }
  }
  return result
}
