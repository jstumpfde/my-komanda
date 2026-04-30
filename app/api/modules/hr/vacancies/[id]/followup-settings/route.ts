import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, followUpCampaigns } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { isFollowUpPreset } from "@/lib/followup/presets"

async function ensureVacancyOwner(id: string, companyId: string) {
  const [v] = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return !!v
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (!(await ensureVacancyOwner(id, user.companyId))) return apiError("Vacancy not found", 404)

    const [campaign] = await db
      .select()
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, id))
      .limit(1)

    return apiSuccess({
      campaign: campaign ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (!(await ensureVacancyOwner(id, user.companyId))) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => ({})) as {
      preset?: string
      enabled?: boolean
      stopOnReply?: boolean
      stopOnVacancyClosed?: boolean
      customMessages?: string[] | null
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.preset === "string" && isFollowUpPreset(body.preset)) {
      updates.preset = body.preset
    }
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled
    if (typeof body.stopOnReply === "boolean") updates.stopOnReply = body.stopOnReply
    if (typeof body.stopOnVacancyClosed === "boolean") updates.stopOnVacancyClosed = body.stopOnVacancyClosed
    if (Array.isArray(body.customMessages)) {
      updates.customMessages = body.customMessages.map(m => String(m).slice(0, 2000)).slice(0, 20)
    } else if (body.customMessages === null) {
      updates.customMessages = null
    }

    const [existing] = await db
      .select()
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, id))
      .limit(1)

    if (existing) {
      await db.update(followUpCampaigns).set(updates).where(eq(followUpCampaigns.id, existing.id))
      const [refreshed] = await db.select().from(followUpCampaigns).where(eq(followUpCampaigns.id, existing.id)).limit(1)
      return apiSuccess({ campaign: refreshed })
    }

    const insertValues = {
      vacancyId: id,
      preset: typeof updates.preset === "string" ? updates.preset : "off",
      enabled: typeof updates.enabled === "boolean" ? updates.enabled : false,
      stopOnReply: typeof updates.stopOnReply === "boolean" ? updates.stopOnReply : true,
      stopOnVacancyClosed: typeof updates.stopOnVacancyClosed === "boolean" ? updates.stopOnVacancyClosed : true,
      customMessages: Array.isArray(updates.customMessages) ? (updates.customMessages as string[]) : null,
    }
    const [created] = await db.insert(followUpCampaigns).values(insertValues).returning()
    return apiSuccess({ campaign: created })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
