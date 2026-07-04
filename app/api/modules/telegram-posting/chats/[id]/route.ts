// PATCH { category?, is_enabled?, cost_per_post? } — пометить чат категорией
// job/product, вкл/выкл, или задать стоимость размещения (₽/пост, для аналитики).
// DELETE — убрать чат из реестра (только если по нему НЕТ истории постов/
// кликов — иначе каскад снёс бы данные аналитики; для "убрать из оборота"
// с сохранением истории используйте is_enabled=false).
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostingChats, telegramPostDeliveries, telegramPostLinks } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

const ALLOWED_CATEGORIES = new Set(["job", "product"])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const patch: Partial<typeof telegramPostingChats.$inferInsert> = { updatedAt: new Date() }
    if (body.category !== undefined) {
      if (body.category !== null && !ALLOWED_CATEGORIES.has(body.category)) {
        return apiError("Недопустимая категория", 400)
      }
      patch.category = body.category
    }
    if (typeof body.is_enabled === "boolean") {
      patch.isEnabled = body.is_enabled
    }
    if (body.cost_per_post !== undefined) {
      if (body.cost_per_post === null || body.cost_per_post === "") {
        patch.costPerPost = null
      } else {
        const n = Number(body.cost_per_post)
        if (!Number.isFinite(n) || n < 0) return apiError("Некорректная стоимость размещения", 400)
        patch.costPerPost = n.toFixed(2)
      }
    }

    const [updated] = await db
      .update(telegramPostingChats)
      .set(patch)
      .where(and(eq(telegramPostingChats.id, id), eq(telegramPostingChats.userId, user.id as string)))
      .returning()

    if (!updated) return apiError("Чат не найден", 404)
    return apiSuccess({ item: updated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/chats/:id] PATCH", err)
    return apiError("Не удалось обновить чат", 500)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params

    const [chat] = await db
      .select({ id: telegramPostingChats.id })
      .from(telegramPostingChats)
      .where(and(eq(telegramPostingChats.id, id), eq(telegramPostingChats.userId, user.id as string)))
      .limit(1)
    if (!chat) return apiError("Чат не найден", 404)

    const [{ deliveriesCount }] = await db
      .select({ deliveriesCount: sql<number>`count(*)::int` })
      .from(telegramPostDeliveries)
      .where(eq(telegramPostDeliveries.chatId, id))
    const [{ linksCount }] = await db
      .select({ linksCount: sql<number>`count(*)::int` })
      .from(telegramPostLinks)
      .where(eq(telegramPostLinks.chatId, id))

    if (deliveriesCount > 0 || linksCount > 0) {
      return apiError(
        "По этому чату уже есть история постов/кликов — удаление снесло бы данные аналитики. Отключите чат (переключатель «Включён»), не удаляйте.",
        409
      )
    }

    await db
      .delete(telegramPostingChats)
      .where(and(eq(telegramPostingChats.id, id), eq(telegramPostingChats.userId, user.id as string)))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/chats/:id] DELETE", err)
    return apiError("Не удалось удалить чат", 500)
  }
}
