import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents, calendarEventParticipants } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and, gte, lte } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)

    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const type = searchParams.get("type")
    const filter = searchParams.get("filter") ?? "all" // mine | hr | all

    const conditions = [eq(calendarEvents.companyId, user.companyId)]

    if (start) {
      conditions.push(gte(calendarEvents.startAt, new Date(start)))
    }
    if (end) {
      conditions.push(lte(calendarEvents.startAt, new Date(end)))
    }
    if (type) {
      conditions.push(eq(calendarEvents.type, type))
    }
    if (filter === "mine") {
      conditions.push(eq(calendarEvents.createdBy, user.id!))
    }

    const events = await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt)

    return apiSuccess(events)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const { title, description, type, startAt, endAt, allDay, roomId, color, recurrence, participants } = body

    if (!title || !startAt || !endAt) {
      return apiError("Обязательные поля: title, startAt, endAt")
    }

    const [event] = await db
      .insert(calendarEvents)
      .values({
        companyId: user.companyId,
        title,
        description,
        type: type ?? "meeting",
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        allDay: allDay ?? false,
        roomId: roomId ?? null,
        createdBy: user.id!,
        color,
        recurrence,
        status: "confirmed",
      })
      .returning()

    if (participants && Array.isArray(participants) && participants.length > 0) {
      await db.insert(calendarEventParticipants).values(
        participants.map((userId: string) => ({
          eventId: event.id,
          userId,
          status: "pending",
        }))
      )
    }

    return apiSuccess(event, 201)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
