// GET — список синхронизированных Telegram-чатов владельца платформы.
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostingChats } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requirePlatformAdmin()
    const items = await db
      .select()
      .from(telegramPostingChats)
      .where(eq(telegramPostingChats.userId, user.id as string))
      .orderBy(desc(telegramPostingChats.updatedAt))
    return apiSuccess({ items })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/chats] GET", err)
    return apiError("Ошибка загрузки чатов", 500)
  }
}
