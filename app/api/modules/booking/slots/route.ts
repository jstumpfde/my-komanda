import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingServices, bookingResources } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { DEFAULT_SCHEDULE, DEFAULT_BREAKS } from "@/lib/booking/constants"

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams
    const dateStr = sp.get("date")
    const serviceId = sp.get("serviceId")
    const resourceId = sp.get("resourceId")

    if (!dateStr || !serviceId) {
      return apiError("'date' and 'serviceId' are required", 400)
    }

    // Получить услугу (длительность)
    const [service] = await db
      .select()
      .from(bookingServices)
      .where(and(eq(bookingServices.id, serviceId), eq(bookingServices.tenantId, user.companyId)))
    if (!service) return apiError("Service not found", 404)

    const duration = service.duration

    // Получить расписание ресурса (или дефолт)
    let schedule = DEFAULT_SCHEDULE
    let breaks = DEFAULT_BREAKS

    if (resourceId) {
      const [resource] = await db
        .select()
        .from(bookingResources)
        .where(and(eq(bookingResources.id, resourceId), eq(bookingResources.tenantId, user.companyId)))
      if (resource?.schedule) schedule = resource.schedule as typeof DEFAULT_SCHEDULE
      if (resource?.breaks) breaks = resource.breaks as typeof DEFAULT_BREAKS
    }

    // Какой день недели
    const dateObj = new Date(dateStr + "T00:00:00")
    const dayKey = DAY_KEYS[dateObj.getDay()]
    const daySchedule = schedule[dayKey]
    if (!daySchedule || !daySchedule.active) {
      return apiSuccess({ slots: [], message: "Нерабочий день" })
    }

    const dayStart = timeToMin(daySchedule.start)
    const dayEnd = timeToMin(daySchedule.end)

    // Существующие записи на дату
    const conditions = [
      eq(bookings.tenantId, user.companyId),
      eq(bookings.date, dateStr),
      eq(bookings.status, "confirmed"),
    ]
    if (resourceId) {
      conditions.push(eq(bookings.resourceId, resourceId))
    }

    const existingBookings = await db
      .select({ startTime: bookings.startTime, endTime: bookings.endTime })
      .from(bookings)
      .where(and(...conditions))

    const busyRanges = existingBookings.map((b) => ({
      start: timeToMin(b.startTime),
      end: timeToMin(b.endTime),
    }))

    // Перерывы
    for (const br of breaks) {
      busyRanges.push({ start: timeToMin(br.start), end: timeToMin(br.end) })
    }

    // Генерируем слоты
    const slots: { time: string; available: boolean }[] = []
    for (let t = dayStart; t + duration <= dayEnd; t += 30) {
      const slotEnd = t + duration
      const conflict = busyRanges.some((r) => t < r.end && slotEnd > r.start)
      slots.push({ time: minToTime(t), available: !conflict })
    }

    return apiSuccess({ slots, duration, date: dateStr })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
