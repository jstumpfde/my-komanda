import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, userSchedules } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface DayCfg { enabled: boolean; from: string; to: string }
type WeekCfg = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayCfg>

// PUT /api/settings/team/schedules/[userId] — сохранить/перезаписать график
export async function PUT(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const me = await requireCompany()
    const { userId } = await ctx.params

    const body = await req.json().catch(() => ({})) as {
      weekSchedule?: WeekCfg
      timezone?: string
    }

    if (!body.weekSchedule || typeof body.weekSchedule !== "object") {
      return apiError("Поле 'weekSchedule' обязательно", 400)
    }

    // Проверяем, что юзер принадлежит этой же компании
    const [target] = await db
      .select({ id: users.id, companyId: users.companyId })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.companyId, me.companyId)))
      .limit(1)
    if (!target) return apiError("User not found", 404)

    const now = new Date()
    // upsert: если есть — обновляем, иначе создаём
    const [existing] = await db
      .select({ id: userSchedules.id })
      .from(userSchedules)
      .where(eq(userSchedules.userId, userId))
      .limit(1)

    if (existing) {
      await db
        .update(userSchedules)
        .set({
          weekSchedule: body.weekSchedule,
          timezone:     body.timezone ?? "Europe/Moscow",
          updatedAt:    now,
        })
        .where(eq(userSchedules.userId, userId))
    } else {
      await db.insert(userSchedules).values({
        userId,
        companyId:    me.companyId,
        weekSchedule: body.weekSchedule,
        timezone:     body.timezone ?? "Europe/Moscow",
      })
    }

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[settings/team/schedules/[userId] PUT]", err)
    return apiError("Internal server error", 500)
  }
}
