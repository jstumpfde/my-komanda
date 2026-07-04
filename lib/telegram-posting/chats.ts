// Синхронизация списка диалогов (группы/каналы/личка) из Telegram-аккаунта
// владельца платформы в реестр telegram_posting_chats.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostingChats } from "@/lib/db/schema"
import { getActiveClient } from "./client"

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
