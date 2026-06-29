import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { visitLog, userSessions, users, candidates } from "@/lib/db/schema"
import {eq, and, desc, gte} from "drizzle-orm"
import { isShortId } from "@/lib/short-id"

// /demo/<token> или /test/<token> → token (short_id или token кандидата).
// Маяк присутствия (presence-beacon, раз в ~45 сек) шлёт сюда pathname; для
// демо/теста бампаем candidates.last_activity_at, чтобы фильтр «Кто на сайте»
// показывал кандидата, который прямо сейчас читает слайд (а не только когда
// ответил). visit_log пишется как и раньше — это не трогаем.
async function bumpCandidatePresence(page: string): Promise<void> {
  try {
    const m = page.match(/^\/(?:demo|test)\/([^/?#]+)/)
    if (!m) return
    const token = decodeURIComponent(m[1])
    if (!token) return
    await db
      .update(candidates)
      .set({ lastActivityAt: new Date() })
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
  } catch (err) {
    // Лёгкий best-effort: не валим visit-log из-за presence-бампа.
    console.error("visit-log presence bump:", err instanceof Error ? err.message : err)
  }
}

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

    // Near-real-time присутствие кандидата на демо/тесте (анонимный маяк).
    await bumpCandidatePresence(page)

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
