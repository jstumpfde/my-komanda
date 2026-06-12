import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFollowupPresets } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { sanitizeMessages } from "@/lib/followup/presets-library"

type Params = { params: Promise<{ id: string }> }

// PUT — обновить свой пресет. Системные (system:*) не редактируются.
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (id.startsWith("system:")) return apiError("Системный пресет нельзя изменить — скопируйте его", 400)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120) || "Пресет"
    if (typeof body.description === "string") updates.description = body.description.slice(0, 500)
    if (isFollowUpPreset(body.preset)) updates.preset = body.preset
    if (Array.isArray(body.customDays)) {
      const days = body.customDays.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 1 && d <= 365)
      updates.customDays = days.length > 0 ? days : null
    }
    if ("messages" in body) updates.messages = sanitizeMessages(body.messages)
    if ("messagesOpened" in body) updates.messagesOpened = sanitizeMessages(body.messagesOpened)
    if ("testMessages" in body) updates.testMessages = sanitizeMessages(body.testMessages)
    if ("testMessagesOpened" in body) updates.testMessagesOpened = sanitizeMessages(body.testMessagesOpened)
    if (isFollowUpPreset(body.testPreset)) updates.testPreset = body.testPreset

    const res = await db
      .update(companyFollowupPresets)
      .set(updates)
      .where(and(eq(companyFollowupPresets.id, id), eq(companyFollowupPresets.companyId, user.companyId)))
      .returning({ id: companyFollowupPresets.id })
    if (res.length === 0) return apiError("Пресет не найден", 404)
    return apiSuccess({ id })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets PUT]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// DELETE — удалить свой пресет.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (id.startsWith("system:")) return apiError("Системный пресет всегда доступен и не удаляется", 400)
    const res = await db
      .delete(companyFollowupPresets)
      .where(and(eq(companyFollowupPresets.id, id), eq(companyFollowupPresets.companyId, user.companyId)))
      .returning({ id: companyFollowupPresets.id })
    if (res.length === 0) return apiError("Пресет не найден", 404)
    return apiSuccess({ deleted: id })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets DELETE]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
