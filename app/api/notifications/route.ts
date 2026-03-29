import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { eq, and, desc, count, sql } from "drizzle-orm"

// GET /api/notifications?unread=true
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get("unread") === "true"
  const countOnly = url.searchParams.get("count") === "true"

  if (countOnly) {
    const [result] = await db
      .select({ cnt: count() })
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, session.user.companyId),
        eq(notifications.isRead, false),
        // Either for this user or for all (userId is null)
        sql`(${notifications.userId} = ${session.user.id} OR ${notifications.userId} IS NULL)`
      ))
    return NextResponse.json({ unreadCount: Number(result?.cnt ?? 0) })
  }

  const items = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.tenantId, session.user.companyId),
      sql`(${notifications.userId} = ${session.user.id} OR ${notifications.userId} IS NULL)`,
      unreadOnly ? eq(notifications.isRead, false) : undefined,
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(20)

  return NextResponse.json(items)
}

// PATCH /api/notifications — mark all read or specific ids
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (body.action === "mark-all-read") {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.tenantId, session.user.companyId),
        sql`(${notifications.userId} = ${session.user.id} OR ${notifications.userId} IS NULL)`,
        eq(notifications.isRead, false),
      ))
    return NextResponse.json({ success: true })
  }

  if (body.action === "mark-read" && body.id) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, body.id))
    return NextResponse.json({ success: true })
  }

  // Trigger CRON scans manually
  if (body.action === "scan") {
    const [pulseRes, flightRes] = await Promise.all([
      fetch(new URL("/api/cron/pulse-alerts", req.url), { method: "POST" }),
      fetch(new URL("/api/cron/flight-risk-alerts", req.url), { method: "POST" }),
    ])
    const pulse = await pulseRes.json()
    const flight = await flightRes.json()
    return NextResponse.json({ pulse, flight })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
