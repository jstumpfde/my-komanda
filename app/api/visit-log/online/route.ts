import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSessions, users } from "@/lib/db/schema"
import { eq, and, gte } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Mark stale sessions offline
  await db.update(userSessions)
    .set({ isOnline: false })
    .where(and(
      eq(userSessions.tenantId, session.user.companyId),
      eq(userSessions.isOnline, true),
    ))

  // Re-mark recent ones as online
  await db.update(userSessions)
    .set({ isOnline: true })
    .where(and(
      eq(userSessions.tenantId, session.user.companyId),
      gte(userSessions.lastActiveAt, fiveMinAgo),
    ))

  const rows = await db
    .select({
      userId: userSessions.userId,
      lastPage: userSessions.lastPage,
      lastActiveAt: userSessions.lastActiveAt,
      ip: userSessions.ip,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(
      eq(userSessions.tenantId, session.user.companyId),
      eq(userSessions.isOnline, true),
      gte(userSessions.lastActiveAt, fiveMinAgo),
    ))

  return NextResponse.json(rows)
}
