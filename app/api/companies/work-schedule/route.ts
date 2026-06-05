import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, type CompanyWorkSchedule } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Standalone-расписание компании (/settings/schedule). НЕ связано с can-send-now
// (vacancies.schedule_*), календарём или hiring-settings — просто хранит значение.

// GET — текущее расписание компании
export async function GET() {
  try {
    const user = await requireCompany()
    const [company] = await db
      .select({ workScheduleJson: companies.workScheduleJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
    return apiSuccess({ workSchedule: (company?.workScheduleJson ?? {}) as CompanyWorkSchedule })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/companies/work-schedule]", err)
    return apiError("Не удалось загрузить расписание", 500)
  }
}

// PUT — полная замена расписания (страница присылает весь объект целиком).
export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as CompanyWorkSchedule
    await db
      .update(companies)
      .set({ workScheduleJson: body ?? {} })
      .where(eq(companies.id, user.companyId))
    return apiSuccess({ workSchedule: body ?? {} })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /api/companies/work-schedule]", err)
    return apiError("Не удалось сохранить расписание", 500)
  }
}
