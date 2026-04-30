// GET / PATCH /api/modules/hr/vacancies/[id]/schedule-settings
// Чтение и сохранение расписания отправки сообщений вакансии.
// Используется компонентом components/vacancies/vacancy-schedule-settings.tsx.

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface CustomHoliday {
  from: string   // YYYY-MM-DD
  to: string     // YYYY-MM-DD
  label: string
}

interface ScheduleResponse {
  scheduleEnabled:            boolean
  scheduleStart:              string
  scheduleEnd:                string
  scheduleTimezone:           string
  scheduleWorkingDays:        number[]
  scheduleExcludedHolidayIds: string[]
  scheduleCustomHolidays:     CustomHoliday[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM      = /^([01]\d|2[0-3]):[0-5]\d$/

function asScheduleResponse(row: {
  scheduleEnabled:            boolean
  scheduleStart:              string
  scheduleEnd:                string
  scheduleTimezone:           string
  scheduleWorkingDays:        unknown
  scheduleExcludedHolidayIds: unknown
  scheduleCustomHolidays:     unknown
}): ScheduleResponse {
  const workingDays = Array.isArray(row.scheduleWorkingDays)
    ? row.scheduleWorkingDays.filter((n): n is number => typeof n === "number" && n >= 1 && n <= 7)
    : []
  const excluded = Array.isArray(row.scheduleExcludedHolidayIds)
    ? row.scheduleExcludedHolidayIds.filter((s): s is string => typeof s === "string")
    : []
  const custom: CustomHoliday[] = Array.isArray(row.scheduleCustomHolidays)
    ? (row.scheduleCustomHolidays as unknown[]).flatMap((c) => {
        if (!c || typeof c !== "object") return []
        const obj = c as Record<string, unknown>
        if (typeof obj.from !== "string" || typeof obj.to !== "string" || typeof obj.label !== "string") return []
        return [{ from: obj.from, to: obj.to, label: obj.label }]
      })
    : []
  return {
    scheduleEnabled:            row.scheduleEnabled,
    scheduleStart:              row.scheduleStart,
    scheduleEnd:                row.scheduleEnd,
    scheduleTimezone:           row.scheduleTimezone,
    scheduleWorkingDays:        workingDays,
    scheduleExcludedHolidayIds: excluded,
    scheduleCustomHolidays:     custom,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess(asScheduleResponse(row))
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule-settings GET]", err)
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

    // Verify ownership
    const [existing] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => ({})) as Partial<ScheduleResponse>
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof body.scheduleEnabled === "boolean") {
      updates.scheduleEnabled = body.scheduleEnabled
    }
    if (typeof body.scheduleStart === "string" && HHMM.test(body.scheduleStart)) {
      updates.scheduleStart = body.scheduleStart
    }
    if (typeof body.scheduleEnd === "string" && HHMM.test(body.scheduleEnd)) {
      updates.scheduleEnd = body.scheduleEnd
    }
    if (typeof body.scheduleTimezone === "string" && body.scheduleTimezone.length > 0) {
      updates.scheduleTimezone = body.scheduleTimezone
    }
    if (Array.isArray(body.scheduleWorkingDays)) {
      const days = body.scheduleWorkingDays.filter((n) => typeof n === "number" && n >= 1 && n <= 7)
      updates.scheduleWorkingDays = days
    }
    if (Array.isArray(body.scheduleExcludedHolidayIds)) {
      const ids = body.scheduleExcludedHolidayIds.filter((s): s is string => typeof s === "string")
      updates.scheduleExcludedHolidayIds = ids
    }
    if (Array.isArray(body.scheduleCustomHolidays)) {
      const cleaned = body.scheduleCustomHolidays.flatMap((c): CustomHoliday[] => {
        if (!c || typeof c !== "object") return []
        const from = (c as { from?: unknown }).from
        const to   = (c as { to?: unknown }).to
        const lbl  = (c as { label?: unknown }).label
        if (typeof from !== "string" || !ISO_DATE.test(from)) return []
        if (typeof to !== "string"   || !ISO_DATE.test(to))   return []
        if (typeof lbl !== "string") return []
        return [{ from, to, label: lbl.trim().slice(0, 100) }]
      })
      updates.scheduleCustomHolidays = cleaned
    }

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))
      .returning({
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })

    return apiSuccess(asScheduleResponse(updated))
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[schedule-settings PATCH]", err)
    return apiError("Internal server error", 500)
  }
}
