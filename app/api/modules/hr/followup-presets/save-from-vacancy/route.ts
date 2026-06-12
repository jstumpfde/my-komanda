import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFollowupPresets, followUpCampaigns, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { isFollowUpPreset } from "@/lib/followup/presets"

// POST — сохранить текущий дожим вакансии как НОВЫЙ свой пресет.
// body: { vacancyId, name }
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as { vacancyId?: string; name?: string }
    if (!body.vacancyId) return apiError("vacancyId обязателен", 400)

    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const [camp] = await db
      .select()
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, body.vacancyId))
      .limit(1)
    if (!camp) return apiError("У вакансии ещё нет настроек дожима", 404)

    const name = (body.name ?? "").trim().slice(0, 120) || `Пресет из «${vac.title ?? "вакансии"}»`

    const [created] = await db
      .insert(companyFollowupPresets)
      .values({
        companyId:          user.companyId,
        name,
        description:        null,
        preset:             isFollowUpPreset(camp.preset) ? camp.preset : "standard",
        customDays:         null,
        messages:           camp.customMessages ?? null,
        messagesOpened:     camp.customMessagesOpened ?? null,
        testPreset:         camp.testPreset ?? null,
        testMessages:       camp.testMessages ?? null,
        testMessagesOpened: camp.testMessagesOpened ?? null,
        createdBy:          user.id as string,
      })
      .returning({ id: companyFollowupPresets.id })

    return apiSuccess({ id: created.id, name }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets save-from-vacancy]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
