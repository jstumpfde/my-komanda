// PUT/PATCH/GET /api/modules/hr/vacancies/[id]/ai-chatbot
//
// #62: эндпоинт активирован для администратора. Пишет в БД три поля
// vacancies.ai_chatbot_enabled / ai_chatbot_settings / ai_chatbot_prompt.
// Обработка входящих сообщений AI-агентом (scan-incoming / process-queue)
// пока НЕ подключена — это будет в Фазах 4-6.

import { NextRequest } from "next/server"
import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireCompany()
    const [row] = await db
      .select({
        enabled:  vacancies.aiChatbotEnabled,
        settings: vacancies.aiChatbotSettings,
        prompt:   vacancies.aiChatbotPrompt,
      })
      .from(vacancies)
      .where(and(
        eq(vacancies.id, id),
        eq(vacancies.companyId, user.companyId),
        isNull(vacancies.deletedAt),
      ))
      .limit(1)
    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess({
      enabled:  row.enabled ?? false,
      settings: row.settings ?? {},
      prompt:   row.prompt ?? "",
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET ai-chatbot]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const updates: Record<string, unknown> = {}
    if (typeof body.enabled === "boolean") {
      updates.aiChatbotEnabled = body.enabled
    }
    if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
      updates.aiChatbotSettings = body.settings as Record<string, unknown>
    }
    if (typeof body.prompt === "string") {
      updates.aiChatbotPrompt = body.prompt.slice(0, 16000)
    }
    if (Object.keys(updates).length === 0) {
      return apiError("Nothing to update", 400)
    }

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(and(
        eq(vacancies.id, id),
        eq(vacancies.companyId, user.companyId),
        isNull(vacancies.deletedAt),
      ))
      .returning({
        enabled:  vacancies.aiChatbotEnabled,
        settings: vacancies.aiChatbotSettings,
        prompt:   vacancies.aiChatbotPrompt,
      })
    if (!updated) return apiError("Vacancy not found", 404)

    return apiSuccess({
      ok:       true,
      enabled:  updated.enabled ?? false,
      settings: updated.settings ?? {},
      prompt:   updated.prompt ?? "",
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT ai-chatbot]", err)
    return apiError("Internal server error", 500)
  }
}
