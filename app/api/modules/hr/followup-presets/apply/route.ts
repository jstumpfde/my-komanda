import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyFollowupPresets, followUpCampaigns, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { isFollowUpPreset } from "@/lib/followup/presets"
import { findSystemPreset, type FollowupPresetDTO } from "@/lib/followup/presets-library"

// POST — применить пресет к вакансии (пишет в follow_up_campaigns).
// body: { vacancyId, presetId }
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as { vacancyId?: string; presetId?: string }
    if (!body.vacancyId || !body.presetId) return apiError("vacancyId и presetId обязательны", 400)

    // tenant: вакансия принадлежит компании
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    // Резолвим пресет: системный (виртуальный) или свой
    let dto: FollowupPresetDTO | null = null
    if (body.presetId.startsWith("system:")) {
      dto = findSystemPreset(body.presetId)
    } else {
      const [own] = await db
        .select()
        .from(companyFollowupPresets)
        .where(and(eq(companyFollowupPresets.id, body.presetId), eq(companyFollowupPresets.companyId, user.companyId)))
        .limit(1)
      if (own) {
        dto = {
          id: own.id, system: false, name: own.name, description: own.description,
          preset: isFollowUpPreset(own.preset) ? own.preset : "standard",
          customDays: own.customDays ?? null, messages: own.messages ?? null,
          messagesOpened: own.messagesOpened ?? null, testPreset: own.testPreset ?? null,
          testMessages: own.testMessages ?? null, testMessagesOpened: own.testMessagesOpened ?? null,
        }
      }
    }
    if (!dto) return apiError("Пресет не найден", 404)

    const values = {
      preset:               dto.preset,
      customMessages:       dto.messages,
      customMessagesOpened: dto.messagesOpened,
      testPreset:           dto.testPreset && isFollowUpPreset(dto.testPreset) ? dto.testPreset : "off",
      testMessages:         dto.testMessages,
      testMessagesOpened:   dto.testMessagesOpened,
      enabled:              dto.preset !== "off",
      updatedAt:            new Date(),
    }

    // upsert по вакансии
    const [existing] = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, body.vacancyId))
      .limit(1)
    if (existing) {
      await db.update(followUpCampaigns).set(values).where(eq(followUpCampaigns.id, existing.id))
    } else {
      await db.insert(followUpCampaigns).values({ vacancyId: body.vacancyId, ...values })
    }

    return apiSuccess({ applied: body.presetId, vacancyId: body.vacancyId, note: dto.customDays ? "Кастомные дни пресета не применяются автоматически — задайте их в расписании дожима вакансии." : null })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[followup-presets apply]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
