import { NextRequest } from "next/server"
import { eq, and, desc, sql, gte, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { activityLog, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")))
    const offset = (page - 1) * limit

    const entityType = url.searchParams.get("entityType")
    const entityId = url.searchParams.get("entityId")
    const userId = url.searchParams.get("userId")
    const action = url.searchParams.get("action")
    const from = url.searchParams.get("from")
    const to = url.searchParams.get("to")

    // Build conditions
    const conditions = [eq(activityLog.companyId, user.companyId)]
    if (entityType) conditions.push(eq(activityLog.entityType, entityType))
    if (entityId) conditions.push(eq(activityLog.entityId, entityId))
    if (userId) conditions.push(eq(activityLog.userId, userId))
    if (action) conditions.push(eq(activityLog.action, action))
    if (from) conditions.push(gte(activityLog.createdAt, new Date(from)))
    if (to) conditions.push(lte(activityLog.createdAt, new Date(to)))

    const where = and(...conditions)

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          entityTitle: activityLog.entityTitle,
          module: activityLog.module,
          details: activityLog.details,
          createdAt: activityLog.createdAt,
          userId: activityLog.userId,
          userName: users.name,
        })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.userId, users.id))
        .where(where)
        .orderBy(desc(activityLog.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(where),
    ])

    return apiSuccess({
      items,
      total: countResult[0]?.count ?? 0,
      page,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[activity-log GET] error:", err)
    return apiError("Internal server error", 500)
  }
}
