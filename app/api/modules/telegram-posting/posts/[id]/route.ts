// PATCH — редактирование поста (до отправки), пауза/возобновление.
// DELETE — удаление поста.
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramScheduledPosts } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

const ALLOWED_REPEAT = new Set(["none", "daily", "weekly"])
const MAX_STAGGER_MINUTES = 480 // 8ч — не ломает DELIVERY_WINDOW_MS (12ч) в sender.ts

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const patch: Partial<typeof telegramScheduledPosts.$inferInsert> = { updatedAt: new Date() }

    if (typeof body.title === "string") {
      if (!body.title.trim()) return apiError("Название не может быть пустым", 400)
      patch.title = body.title.trim()
    }
    if (typeof body.body === "string") {
      if (!body.body.trim()) return apiError("Текст поста не может быть пустым", 400)
      patch.body = body.body
    }
    if (body.image_path !== undefined) {
      patch.imagePath = body.image_path || null
    }
    if (body.link_url !== undefined) {
      patch.linkUrl = typeof body.link_url === "string" && body.link_url.trim() ? body.link_url.trim() : null
    }
    if (body.stagger_minutes !== undefined) {
      const n = Number(body.stagger_minutes)
      if (!Number.isFinite(n) || n < 0 || n > MAX_STAGGER_MINUTES) {
        return apiError(`Разнесение по времени — от 0 до ${MAX_STAGGER_MINUTES} мин.`, 400)
      }
      patch.staggerMinutes = n
    }
    if (Array.isArray(body.chat_ids)) {
      if (body.chat_ids.length === 0) return apiError("Выберите хотя бы один чат", 400)
      patch.chatIds = body.chat_ids
    }
    if (body.scheduled_at) {
      const d = new Date(body.scheduled_at)
      if (Number.isNaN(d.getTime())) return apiError("Некорректная дата", 400)
      patch.scheduledAt = d
    }
    if (body.repeat_rule !== undefined) {
      if (!ALLOWED_REPEAT.has(body.repeat_rule)) return apiError("Недопустимое правило повтора", 400)
      patch.repeatRule = body.repeat_rule
    }
    // Пауза/возобновление: только между 'scheduled' и 'paused' (не трогаем sending/sent/error извне).
    if (body.status === "paused" || body.status === "scheduled") {
      patch.status = body.status
    }

    const [updated] = await db
      .update(telegramScheduledPosts)
      .set(patch)
      .where(and(eq(telegramScheduledPosts.id, id), eq(telegramScheduledPosts.userId, user.id as string)))
      .returning()

    if (!updated) return apiError("Пост не найден", 404)
    return apiSuccess({ item: updated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts/:id] PATCH", err)
    return apiError("Не удалось обновить пост", 500)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params
    const [deleted] = await db
      .delete(telegramScheduledPosts)
      .where(and(eq(telegramScheduledPosts.id, id), eq(telegramScheduledPosts.userId, user.id as string)))
      .returning({ id: telegramScheduledPosts.id })

    if (!deleted) return apiError("Пост не найден", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts/:id] DELETE", err)
    return apiError("Не удалось удалить пост", 500)
  }
}
