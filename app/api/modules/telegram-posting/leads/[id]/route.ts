// PATCH { source_chat_id?, notes? } — ручная правка атрибуции лида.
// Указание source_chat_id вручную всегда помечает source_confidence='manual'.
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramDmLeads } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const patch: Partial<typeof telegramDmLeads.$inferInsert> = {}
    if (body.source_chat_id !== undefined) {
      patch.sourceChatId = body.source_chat_id || null
      patch.sourceConfidence = body.source_chat_id ? "manual" : null
      // Ручной выбор — окончательный, больше не размножаем лид по кандидатам
      // в аналитике (см. analytics/route.ts).
      patch.candidateChatIds = null
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null
    }

    if (Object.keys(patch).length === 0) {
      return apiError("Нечего обновлять", 400)
    }

    const [updated] = await db
      .update(telegramDmLeads)
      .set(patch)
      .where(and(eq(telegramDmLeads.id, id), eq(telegramDmLeads.userId, user.id as string)))
      .returning()

    if (!updated) return apiError("Лид не найден", 404)
    return apiSuccess({ item: updated })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/leads/:id] PATCH", err)
    return apiError("Не удалось обновить лид", 500)
  }
}
