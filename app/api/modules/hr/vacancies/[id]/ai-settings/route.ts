import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: vacancies.id, current: vacancies.aiProcessSettings })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => ({})) as Partial<VacancyAiProcessSettings> & {
      aiScoringEnabled?: boolean
    }
    const current = (existing.current as VacancyAiProcessSettings | null) ?? {}

    const settings: VacancyAiProcessSettings = {
      ...current,
    }

    // Нижний порог. Сохраняем и в новое minScoreLower, и в legacy minScore
    // (на случай если где-то ещё читается старое поле).
    if (body.minScoreLower !== undefined) {
      const n = Number(body.minScoreLower)
      if (Number.isFinite(n)) {
        const v = Math.max(0, Math.min(100, Math.round(n)))
        settings.minScoreLower = v
        settings.minScore = v
      }
    } else if (body.minScore !== undefined) {
      const n = Number(body.minScore)
      if (Number.isFinite(n)) {
        const v = Math.max(0, Math.min(100, Math.round(n)))
        settings.minScore = v
        settings.minScoreLower = v
      }
    }
    if (body.minScoreUpper !== undefined) {
      const n = Number(body.minScoreUpper)
      if (Number.isFinite(n)) settings.minScoreUpper = Math.max(0, Math.min(100, Math.round(n)))
    }
    if (body.midRangeAction !== undefined) {
      const allowed: VacancyAiProcessSettings["midRangeAction"][] = ["prequalification", "direct_demo", "keep_new"]
      settings.midRangeAction = allowed.includes(body.midRangeAction as never)
        ? (body.midRangeAction as VacancyAiProcessSettings["midRangeAction"])
        : "prequalification"
    }
    if (body.prequalificationMode !== undefined) {
      const allowed: VacancyAiProcessSettings["prequalificationMode"][] =
        ["direct_demo", "prequal_then_demo", "prequal_only"]
      settings.prequalificationMode = allowed.includes(body.prequalificationMode as never)
        ? (body.prequalificationMode as VacancyAiProcessSettings["prequalificationMode"])
        : "direct_demo"
    }
    if (body.prequalification !== undefined && body.prequalification !== null && typeof body.prequalification === "object") {
      const pq = body.prequalification
      settings.prequalification = {
        enabled:      typeof pq.enabled === "boolean" ? pq.enabled : false,
        questions:    Array.isArray(pq.questions)
          ? pq.questions.slice(0, 3).map(q => ({
              text:      String(q?.text ?? "").slice(0, 1000),
              required:  Boolean(q?.required),
              criterion: String(q?.criterion ?? "").slice(0, 1000),
            }))
          : [],
        reminderD1:   typeof pq.reminderD1 === "string" ? pq.reminderD1.slice(0, 2000) : undefined,
        reminderD3:   typeof pq.reminderD3 === "string" ? pq.reminderD3.slice(0, 2000) : undefined,
        fallbackDays: typeof pq.fallbackDays === "number" && pq.fallbackDays > 0
          ? Math.min(30, Math.round(pq.fallbackDays))
          : undefined,
      }
    }
    if (body.belowThresholdAction !== undefined) {
      settings.belowThresholdAction = body.belowThresholdAction === "keep_new" ? "keep_new" : "reject"
    }
    if (body.inviteMessage !== undefined) {
      const text = typeof body.inviteMessage === "string" ? body.inviteMessage.slice(0, 2000) : ""
      // P0-43: первое сообщение должно содержать плейсхолдер ссылки на демо.
      // Принимаем {{demo_link}} (канон) и {ссылка} (легаси/русская форма).
      // Пустое сообщение оставляем валидным — это «отключить firstMessage».
      if (text.length > 0 && !/\{\{\s*demo_link\s*\}\}/.test(text) && !/\{\s*ссылка\s*\}/.test(text)) {
        return apiError(
          "Шаблон должен содержать плейсхолдер ссылки на демо ({{demo_link}} или {ссылка})",
          400,
        )
      }
      settings.inviteMessage = text || undefined
    }
    if (body.reInviteMessage !== undefined) {
      settings.reInviteMessage = typeof body.reInviteMessage === "string"
        ? body.reInviteMessage.slice(0, 2000)
        : undefined
    }
    if (body.rejectMessage !== undefined) {
      settings.rejectMessage = typeof body.rejectMessage === "string"
        ? body.rejectMessage.slice(0, 2000)
        : undefined
    }

    const updates: Record<string, unknown> = {
      aiProcessSettings: settings,
      updatedAt: new Date(),
    }
    if (typeof body.aiScoringEnabled === "boolean") {
      updates.aiScoringEnabled = body.aiScoringEnabled
    }

    await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))

    return apiSuccess({
      ok: true,
      settings,
      aiScoringEnabled: typeof body.aiScoringEnabled === "boolean" ? body.aiScoringEnabled : undefined,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
