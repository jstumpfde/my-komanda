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

    if (body.minScore !== undefined) {
      const n = Number(body.minScore)
      if (Number.isFinite(n)) settings.minScore = Math.max(0, Math.min(100, Math.round(n)))
    }
    if (body.belowThresholdAction !== undefined) {
      settings.belowThresholdAction = body.belowThresholdAction === "keep_new" ? "keep_new" : "reject"
    }
    if (body.inviteMessage !== undefined) {
      settings.inviteMessage = typeof body.inviteMessage === "string"
        ? body.inviteMessage.slice(0, 2000)
        : undefined
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
