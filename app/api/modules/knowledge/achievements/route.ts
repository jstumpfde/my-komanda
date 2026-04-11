import { NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userAchievements, users } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import {
  POINTS_BY_TYPE,
  awardPoints,
  getLeaderboard,
  type AchievementType,
} from "@/lib/knowledge/achievements"

// GET  — лидерборд тенанта + список последних начислений
// POST — начислить баллы текущему пользователю (или переданному userId, если
//        вызывающий — админ/директор). Body: { type, sourceId?, note?, userId? }

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "5") || 5

    const leaderboard = await getLeaderboard(user.companyId, limit)

    const recent = await db
      .select({
        id: userAchievements.id,
        type: userAchievements.type,
        points: userAchievements.points,
        note: userAchievements.note,
        earnedAt: userAchievements.earnedAt,
        userName: users.name,
      })
      .from(userAchievements)
      .leftJoin(users, eq(users.id, userAchievements.userId))
      .where(eq(userAchievements.tenantId, user.companyId))
      .orderBy(desc(userAchievements.earnedAt))
      .limit(20)

    // Точки текущего пользователя
    const ownRows = await db
      .select({
        total: userAchievements.points,
      })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.tenantId, user.companyId),
          eq(userAchievements.userId, user.id),
        ),
      )
    const myPoints = ownRows.reduce((s, r) => s + (r.total ?? 0), 0)

    return apiSuccess({ leaderboard, recent, myPoints })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/achievements] GET", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as {
      type?: AchievementType
      sourceId?: string
      note?: string
      userId?: string
    }

    if (!body.type || !(body.type in POINTS_BY_TYPE)) {
      return apiError("Неизвестный type", 400)
    }

    // Разрешаем начислять другим только платформенному админу/директору/hr_lead
    const targetUserId = body.userId ?? user.id
    if (body.userId && body.userId !== user.id) {
      const role = user.role
      const allowed =
        role === "platform_admin" || role === "platform_manager" ||
        role === "director" || role === "hr_lead"
      if (!allowed) return apiError("Forbidden", 403)
    }

    const result = await awardPoints(
      user.companyId,
      targetUserId,
      body.type,
      body.sourceId,
      body.note,
    )

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/achievements] POST", err)
    return apiError("Internal server error", 500)
  }
}
