import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, type CompanyWorkSchedule, type CalendarDaySchedule } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — текущее расписание календаря компании
export async function GET() {
  try {
    const user = await requireCompany()
    const [company] = await db
      .select({ workScheduleJson: companies.workScheduleJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const schedule = (company?.workScheduleJson as CompanyWorkSchedule)?.calendarWeekSchedule ?? null
    return apiSuccess({ calendarWeekSchedule: schedule })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/calendar/settings]", err)
    return apiError("Не удалось загрузить настройки календаря", 500)
  }
}

// PUT — сохранить расписание календаря (мёрджим только calendarWeekSchedule в jsonb)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = (await req.json().catch(() => ({}))) as {
      calendarWeekSchedule?: Record<string, CalendarDaySchedule>
    }

    if (!body.calendarWeekSchedule || typeof body.calendarWeekSchedule !== "object") {
      return apiError("calendarWeekSchedule обязателен", 400)
    }

    // Читаем текущий jsonb и мёрджим только нужное поле
    const [company] = await db
      .select({ workScheduleJson: companies.workScheduleJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const existing = (company?.workScheduleJson ?? {}) as CompanyWorkSchedule
    const updated: CompanyWorkSchedule = {
      ...existing,
      calendarWeekSchedule: body.calendarWeekSchedule,
    }

    await db
      .update(companies)
      .set({ workScheduleJson: updated })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ calendarWeekSchedule: body.calendarWeekSchedule })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /api/modules/hr/calendar/settings]", err)
    return apiError("Не удалось сохранить настройки календаря", 500)
  }
}
