// GET — лог доставок по посту (с названиями чатов).
import { and, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramScheduledPosts, telegramPostDeliveries, telegramPostingChats } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params

    const [post] = await db
      .select({ id: telegramScheduledPosts.id })
      .from(telegramScheduledPosts)
      .where(and(eq(telegramScheduledPosts.id, id), eq(telegramScheduledPosts.userId, user.id as string)))
      .limit(1)
    if (!post) return apiError("Пост не найден", 404)

    const items = await db
      .select({
        id: telegramPostDeliveries.id,
        chatId: telegramPostDeliveries.chatId,
        chatTitle: telegramPostingChats.title,
        sentAt: telegramPostDeliveries.sentAt,
        status: telegramPostDeliveries.status,
        error: telegramPostDeliveries.error,
        tgMessageId: telegramPostDeliveries.tgMessageId,
      })
      .from(telegramPostDeliveries)
      .leftJoin(telegramPostingChats, eq(telegramPostDeliveries.chatId, telegramPostingChats.id))
      .where(eq(telegramPostDeliveries.postId, id))
      .orderBy(desc(telegramPostDeliveries.sentAt))

    return apiSuccess({ items })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts/:id/deliveries] GET", err)
    return apiError("Ошибка загрузки лога доставок", 500)
  }
}
