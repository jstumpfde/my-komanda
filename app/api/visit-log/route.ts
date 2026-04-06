import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { visitLog, userSessions, users } from "@/lib/db/schema"
import { eq, and, desc, gte, sql } from "drizzle-orm"

// POST — record a page visit
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const body = await req.json()
    const page = body.page as string
    if (!page) return NextResponse.json({ ok: false }, { status: 400 })

    const userId = session?.user?.id || null
    const tenantId = session?.user?.companyId || null
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
    const userAgent = req.headers.get("user-agent") || null
    const referrer = body.referrer || null
    const sessionId = body.sessionId || null

    // Insert visit log
    await db.insert(visitLog).values({
      userId,
      tenantId,
      sessionId,
      page,
      ip,
      userAgent,
      referrer,
    })

    // Update user session if authenticated
    if (userId) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)

      // Mark stale sessions as offline
      await db.update(userSessions)
        .set({ isOnline: false })
        .where(and(
          eq(userSessions.userId, userId),
          eq(userSessions.isOnline, true),
        ))

      // Find recent session
      const [existing] = await db.select().from(userSessions)
        .where(and(
          eq(userSessions.userId, userId),
          gte(userSessions.lastActiveAt, fiveMinAgo),
        ))
        .orderBy(desc(userSessions.lastActiveAt))
        .limit(1)

      if (existing) {
        await db.update(userSessions)
          .set({ lastActiveAt: new Date(), lastPage: page, isOnline: true, ip, userAgent })
          .where(eq(userSessions.id, existing.id))
      } else {
        await db.insert(userSessions).values({
          userId,
          tenantId,
          lastPage: page,
          ip,
          userAgent,
          isOnline: true,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Visit log error:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// GET — list visits
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = req.nextUrl.searchParams
  const limit = Math.min(Number(url.get("limit") || 100), 500)

  const rows = await db
    .select({
      id: visitLog.id,
      page: visitLog.page,
      ip: visitLog.ip,
      createdAt: visitLog.createdAt,
      userId: visitLog.userId,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    })
    .from(visitLog)
    .leftJoin(users, eq(visitLog.userId, users.id))
    .where(eq(visitLog.tenantId, session.user.companyId))
    .orderBy(desc(visitLog.createdAt))
    .limit(limit)

  return NextResponse.json(rows)
}
