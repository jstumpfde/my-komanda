// POST — синхронизировать список диалогов из Telegram-аккаунта владельца.
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"
import { syncChats } from "@/lib/telegram-posting/chats"

export async function POST() {
  try {
    const user = await requirePlatformAdmin()
    const result = await syncChats(user.id as string)
    return apiSuccess({ ok: true, ...result })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/chats/sync] POST", err)
    return apiError(err instanceof Error ? err.message : "Не удалось синхронизировать чаты", 500)
  }
}
