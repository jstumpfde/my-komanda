// PATCH { category?, is_enabled? } — пометить чат категорией job/product или вкл/выкл.
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramPostingChats } from "@/lib/db/schema"
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
