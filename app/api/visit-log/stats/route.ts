import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { visitLog } from "@/lib/db/schema"
import { eq, gte, sql, desc, and } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = session.user.companyId
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Unique visitors
  const [todayVisitors] = await db
    .select({ count: sql<number>`count(distinct ${visitLog.userId})` })
    .from(visitLog)
    .where(and(eq(visitLog.tenantId, tenantId), gte(visitLog.createdAt, todayStart)))

  const [weekVisitors] = await db
    .select({ count: sql<number>`count(distinct ${visitLog.userId})` })
    .from(visitLog)
    .where(and(eq(visitLog.tenantId, tenantId), gte(visitLog.createdAt, weekAgo)))

  const [monthVisitors] = await db
    .select({ count: sql<number>`count(distinct ${visitLog.userId})` })
    .from(visitLog)
    .where(and(eq(visitLog.tenantId, tenantId), gte(visitLog.createdAt, monthAgo)))

  // Top pages
  const topPages = await db
    .select({
      page: visitLog.page,
      views: sql<number>`count(*)`.as("views"),
    })
    .from(visitLog)
    .where(and(eq(visitLog.tenantId, tenantId), gte(visitLog.createdAt, weekAgo)))
    .groupBy(visitLog.page)
    .orderBy(desc(sql`count(*)`))
    .limit(10)

  // Activity by hour (last 24h)
  const hourlyActivity = await db
    .select({
      hour: sql<number>`extract(hour from ${visitLog.createdAt})`.as("hour"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(visitLog)
    .where(and(eq(visitLog.tenantId, tenantId), gte(visitLog.createdAt, todayStart)))
    .groupBy(sql`extract(hour from ${visitLog.createdAt})`)
    .orderBy(sql`extract(hour from ${visitLog.createdAt})`)

  return NextResponse.json({
    visitors: {
      today: Number(todayVisitors?.count ?? 0),
      week: Number(weekVisitors?.count ?? 0),
      month: Number(monthVisitors?.count ?? 0),
    },
    topPages,
    hourlyActivity,
  })
}
