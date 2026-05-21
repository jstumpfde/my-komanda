import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancies, demos, followUpCampaigns } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function generateDuplicateSlug(originalSlug: string | null | undefined): Promise<string> {
  // Draft vacancies start as «Новая вакансия» → slug «novaya-vakansiya-…». Don't propagate.
  if (!originalSlug || originalSlug.includes("novaya-vakansiya")) {
    return `vacancy-${nanoid(8)}`
  }

  // Strip trailing -N so a copy of "marketolog-b2b-2" probes -3 rather than -2-2.
  const base = originalSlug.replace(/-\d+$/, "")
  if (!base) return `vacancy-${nanoid(8)}`

  for (let counter = 2; counter < 100; counter++) {
    const candidate = `${base}-${counter}`
    const [existing] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(eq(vacancies.slug, candidate))
      .limit(1)
    if (!existing) return candidate
  }

  return `vacancy-${nanoid(8)}`
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [original] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!original) {
      return apiError("Vacancy not found", 404)
    }

    const newTitle = `${original.title} (копия)`
    const slug = await generateDuplicateSlug(original.slug)

    // ТЗ-1 Часть 6 (P0-16): копируем ВСЕ настройки 1-в-1.
    // НЕ копируем: status (→draft), hh_* (это связка с hh.ru, у дубля её нет),
    // кандидатов/отклики/hh-сообщения, created_at (текущее время), slug (новый).
    const [duplicate] = await db
      .insert(vacancies)
      .values({
        companyId: user.companyId,
        createdBy: user.id!,
        title: newTitle,
        description: original.description,
        descriptionJson: original.descriptionJson,
        city: original.city,
        format: original.format,
        employment: original.employment,
        category: original.category,
        sidebarSection: original.sidebarSection,
        salaryMin: original.salaryMin,
        salaryMax: original.salaryMax,
        clientCompanyId: original.clientCompanyId,
        clientContactId: original.clientContactId,
        requiredExperience: original.requiredExperience,
        employmentType: original.employmentType,
        schedule: original.schedule,
        hiringPlan: original.hiringPlan,
        employeeType: original.employeeType,
        aiProcessSettings: original.aiProcessSettings,
        aiScoringEnabled: original.aiScoringEnabled,
        autoProcessingEnabled: original.autoProcessingEnabled,
        scheduleEnabled: original.scheduleEnabled,
        scheduleStart: original.scheduleStart,
        scheduleEnd: original.scheduleEnd,
        scheduleTimezone: original.scheduleTimezone,
        scheduleWorkingDays: original.scheduleWorkingDays,
        scheduleExcludedHolidayIds: original.scheduleExcludedHolidayIds,
        scheduleCustomHolidays: original.scheduleCustomHolidays,
        status: "draft" as const,
        slug,
      })
      .returning()

    // Копируем связанные demos (lessons_json + post_demo_settings).
    const originalDemos = await db
      .select()
      .from(demos)
      .where(eq(demos.vacancyId, original.id))

    for (const d of originalDemos) {
      await db.insert(demos).values({
        vacancyId: duplicate.id,
        title: d.title,
        status: d.status,
        lessonsJson: d.lessonsJson,
        postDemoSettings: d.postDemoSettings,
      })
    }

    // Копируем follow_up_campaigns (включая custom_messages обеих веток).
    const originalCampaigns = await db
      .select()
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, original.id))

    for (const c of originalCampaigns) {
      await db.insert(followUpCampaigns).values({
        vacancyId: duplicate.id,
        preset: c.preset,
        enabled: c.enabled,
        stopOnReply: c.stopOnReply,
        stopOnVacancyClosed: c.stopOnVacancyClosed,
        customMessages: c.customMessages,
        customMessagesOpened: c.customMessagesOpened,
      })
    }

    return apiSuccess(duplicate, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
