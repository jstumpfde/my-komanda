import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, type CompanyWorkSchedule, type CalendarDaySchedule } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — текущее расписание календаря компании + праздники
export async function GET() {
  try {
    const user = await requireCompany()
    const [company] = await db
      .select({ workScheduleJson: companies.workScheduleJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const ws = (company?.workScheduleJson as CompanyWorkSchedule) ?? {}
    return apiSuccess({
      calendarWeekSchedule:        ws.calendarWeekSchedule ?? null,
      calendarExcludedHolidayIds:  ws.calendarExcludedHolidayIds ?? null,
      calendarCustomHolidays:      ws.calendarCustomHolidays ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/calendar/settings]", err)
    return apiError("Не удалось загрузить настройки календаря", 500)
  }
}

// PUT — сохранить настройки календаря (мёрджим нужные поля в jsonb)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = (await req.json().catch(() => ({}))) as {
      calendarWeekSchedule?: Record<string, CalendarDaySchedule>
      calendarExcludedHolidayIds?: string[]
      calendarCustomHolidays?: { from: string; to: string; label: string }[]
    }

    // Читаем текущий jsonb и мёрджим только нужные поля
    const [company] = await db
      .select({ workScheduleJson: companies.workScheduleJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const existing = (company?.workScheduleJson ?? {}) as CompanyWorkSchedule
    const updated: CompanyWorkSchedule = { ...existing }

    if (body.calendarWeekSchedule && typeof body.calendarWeekSchedule === "object") {
      updated.calendarWeekSchedule = body.calendarWeekSchedule
    }
    if (Array.isArray(body.calendarExcludedHolidayIds)) {
      updated.calendarExcludedHolidayIds = body.calendarExcludedHolidayIds.filter(
        (s): s is string => typeof s === "string",
      )
    }
    if (Array.isArray(body.calendarCustomHolidays)) {
      updated.calendarCustomHolidays = body.calendarCustomHolidays.flatMap((c) => {
        if (!c || typeof c !== "object") return []
        if (typeof c.from !== "string" || typeof c.to !== "string" || typeof c.label !== "string") return []
        return [{ from: c.from, to: c.to, label: c.label.trim().slice(0, 100) }]
      })
    }

    await db
      .update(companies)
      .set({ workScheduleJson: updated })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({
      calendarWeekSchedule:       updated.calendarWeekSchedule ?? null,
      calendarExcludedHolidayIds: updated.calendarExcludedHolidayIds ?? null,
      calendarCustomHolidays:     updated.calendarCustomHolidays ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /api/modules/hr/calendar/settings]", err)
    return apiError("Не удалось сохранить настройки календаря", 500)
  }
}
