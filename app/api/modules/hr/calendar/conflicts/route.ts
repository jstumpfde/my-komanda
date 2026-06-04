import { NextRequest } from "next/server"
import { and, eq, ne, lt, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// #60: проверка конфликтов времени в календаре.
// GET /api/modules/hr/calendar/conflicts?start=ISO&end=ISO&roomId=&excludeId=
//
// Возвращает события компании, ПЕРЕСЕКАЮЩИЕСЯ по времени с заданным интервалом
// (existing.start < end AND existing.end > start), не отменённые. Делит на:
//   • roomConflicts — те же события, что заняли ту же переговорную (если roomId задан);
//   • timeConflicts — остальные пересечения по времени (общая загрузка/двойное бронирование).
// Не блокирует сохранение — модалка показывает мягкое предупреждение.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const roomId = searchParams.get("roomId")
    const excludeId = searchParams.get("excludeId")

    if (!start || !end) return apiError("Обязательные параметры: start, end")
    const startAt = new Date(start)
    const endAt = new Date(end)
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return apiError("Некорректные даты")
    if (endAt <= startAt) return apiSuccess({ roomConflicts: [], timeConflicts: [] })

    const conds = [
      eq(calendarEvents.companyId, user.companyId),
      ne(calendarEvents.status, "cancelled"),
      // пересечение интервалов: existing.start < end И existing.end > start
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

    return apiSuccess({ roomConflicts, timeConflicts })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
