import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, userSchedules } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/settings/team/schedules — список графиков всех юзеров компании
// LEFT JOIN: чтобы видеть и тех, у кого графика ещё нет
export async function GET() {
  try {
    const me = await requireCompany()

    const usersList = await db
      .select({
        id:        users.id,
        name:      users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.companyId, me.companyId))

    const scheduleRows = await db
      .select({
        userId:       userSchedules.userId,
        weekSchedule: userSchedules.weekSchedule,
        timezone:     userSchedules.timezone,
        updatedAt:    userSchedules.updatedAt,
      })
      .from(userSchedules)
      .where(eq(userSchedules.companyId, me.companyId))

    const byUser = new Map(scheduleRows.map(s => [s.userId, s]))

    const out = usersList.map(u => {
      const s = byUser.get(u.id)
      return {
        userId:       u.id,
        userName:     u.name,
        avatarUrl:    u.avatarUrl,
        weekSchedule: s?.weekSchedule ?? null,
        timezone:     s?.timezone ?? "Europe/Moscow",
        updatedAt:    s?.updatedAt ?? null,
      }
    })

    return apiSuccess(out)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[settings/team/schedules GET]", err)
    return apiError("Internal server error", 500)
  }
}
