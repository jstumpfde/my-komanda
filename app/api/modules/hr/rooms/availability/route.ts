import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and, or, lte, gte } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
    const { searchParams } = new URL(req.url)

    const roomId = searchParams.get("roomId")
    const start = searchParams.get("start")
    const end = searchParams.get("end")

    if (!roomId || !start || !end) {
      return apiError("Обязательные параметры: roomId, start, end")
    }

    const startDate = new Date(start)
    const endDate = new Date(end)

    // Find conflicting events: events that overlap with the given time range
    const conflicts = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.roomId, roomId),
          // Overlap: event.start < end AND event.end > start
          or(
            and(lte(calendarEvents.startAt, endDate), gte(calendarEvents.endAt, startDate)),
          )
        )
      )

    return apiSuccess({
      available: conflicts.length === 0,
      conflicts,
    })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
