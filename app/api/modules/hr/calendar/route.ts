import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents, calendarEventParticipants } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and, gte, lte, or, inArray } from "drizzle-orm"

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
    if (filter === "hr") {
      conditions.push(eq(calendarEvents.scope, "hr"))
    }
    if (filter === "mine") {
      // «Мой» = события, где я автор ИЛИ участник (а не только созданные мной).
      const myParticipantEvents = db
        .select({ eventId: calendarEventParticipants.eventId })
        .from(calendarEventParticipants)
        .where(eq(calendarEventParticipants.userId, user.id!))
      conditions.push(
        or(
          eq(calendarEvents.createdBy, user.id!),
          inArray(calendarEvents.id, myParticipantEvents),
        )!
      )
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

    const { title, description, type, startAt, endAt, allDay, roomId, color, recurrence, participants,
            externalParticipants,
            candidateId, vacancyId, interviewer, interviewType, interviewFormat, interviewStatus, scope,
            location, meetingUrl } = body

    const cleanExternal = Array.isArray(externalParticipants)
      ? (externalParticipants as unknown[]).map(String).map(s => s.trim()).filter(Boolean)
      : []

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
        candidateId:     candidateId ?? null,
        vacancyId:       vacancyId ?? null,
        interviewer:     interviewer ?? null,
        interviewType:   interviewType ?? null,
        interviewFormat: interviewFormat ?? null,
        interviewStatus: interviewStatus ?? null,
        location:    location ?? null,
        meetingUrl:  meetingUrl ?? null,
        scope: (scope === "hr" || scope === "personal") ? scope : "company",
        externalParticipants: cleanExternal,
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
