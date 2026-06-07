import { NextRequest } from "next/server"
import { and, eq, ne, lt, gt, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, calendarEventParticipants, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// #60/#C4: проверка конфликтов времени в календаре.
// GET /api/modules/hr/calendar/conflicts?start=ISO&end=ISO&roomId=&excludeId=&participantIds=id1,id2
//
// Возвращает события компании, ПЕРЕСЕКАЮЩИЕСЯ по времени с заданным интервалом.
//   • roomConflicts     — та же переговорная занята (если roomId задан)
//   • timeConflicts     — остальные пересечения по времени
//   • participantConflicts — участники из participantIds уже заняты в другом событии
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const roomId = searchParams.get("roomId")
    const excludeId = searchParams.get("excludeId")
    const participantIdsParam = searchParams.get("participantIds")
    const participantIds = participantIdsParam ? participantIdsParam.split(",").filter(Boolean) : []

    if (!start || !end) return apiError("Обязательные параметры: start, end")
    const startAt = new Date(start)
    const endAt = new Date(end)
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return apiError("Некорректные даты")
    if (endAt <= startAt) return apiSuccess({ roomConflicts: [], timeConflicts: [], participantConflicts: [] })

    const conds = [
      eq(calendarEvents.companyId, user.companyId),
      ne(calendarEvents.status, "cancelled"),
      lt(calendarEvents.startAt, endAt),
      gt(calendarEvents.endAt, startAt),
    ]
    if (excludeId) conds.push(ne(calendarEvents.id, excludeId))

    const overlapping = await db
      .select({
        id:      calendarEvents.id,
        title:   calendarEvents.title,
        type:    calendarEvents.type,
        startAt: calendarEvents.startAt,
        endAt:   calendarEvents.endAt,
        roomId:  calendarEvents.roomId,
      })
      .from(calendarEvents)
      .where(and(...conds))
      .orderBy(calendarEvents.startAt)

    const roomConflicts = roomId ? overlapping.filter(e => e.roomId === roomId) : []
    const roomIds = new Set(roomConflicts.map(e => e.id))
    const timeConflicts = overlapping.filter(e => !roomIds.has(e.id))

    // C4: проверяем занятость участников (через calendarEventParticipants)
    let participantConflicts: { userId: string; userName: string; eventTitle: string }[] = []
    if (participantIds.length > 0) {
      const busyConds = [
        inArray(calendarEventParticipants.userId, participantIds),
        ne(calendarEvents.status, "cancelled"),
        lt(calendarEvents.startAt, endAt),
        gt(calendarEvents.endAt, startAt),
      ]
      if (excludeId) busyConds.push(ne(calendarEvents.id, excludeId))

      const busyRows = await db
        .select({
          userId:     calendarEventParticipants.userId,
          userName:   users.name,
          eventTitle: calendarEvents.title,
        })
        .from(calendarEventParticipants)
        .innerJoin(calendarEvents, eq(calendarEventParticipants.eventId, calendarEvents.id))
        .innerJoin(users, eq(calendarEventParticipants.userId, users.id))
        .where(and(...busyConds))

      // Дедупликация: один участник может иметь несколько конфликтующих событий — берём первое
      const seen = new Set<string>()
      participantConflicts = busyRows.filter(r => {
        if (seen.has(r.userId)) return false
        seen.add(r.userId)
        return true
      })
    }

    return apiSuccess({ roomConflicts, timeConflicts, participantConflicts })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
