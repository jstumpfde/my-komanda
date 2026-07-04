import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { consentLog, users } from "@/lib/db/schema"
import { and, desc, eq, gte, lte, sql, count } from "drizzle-orm"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// Журнал согласий 152-ФЗ — /admin/platform/consent-log (UI) читает отсюда.
//
// Доступ: session-email из PLATFORM_ADMIN_EMAILS (для UI) ИЛИ X-Platform-Admin-Key
// (для curl/аудита). Иначе 404 (скрываем, как и остальные /api/platform/*).

const PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-platform-admin-key")
  const keyOk = !!key && !!process.env.PLATFORM_ADMIN_KEY && key === process.env.PLATFORM_ADMIN_KEY
  if (!keyOk) {
    const session = await auth()
    if (!isPlatformAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const { searchParams } = new URL(req.url)
  const consentType = searchParams.get("consentType") // 'cookie' | 'privacy_policy' | 'marketing' | null (все)
  const from = searchParams.get("from") // ISO date
  const to = searchParams.get("to")     // ISO date
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1)

  const conditions = []
  if (consentType) conditions.push(eq(consentLog.consentType, consentType))
  if (from) conditions.push(gte(consentLog.createdAt, new Date(from)))
  if (to) conditions.push(lte(consentLog.createdAt, new Date(to)))
  const where = conditions.length ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id:              consentLog.id,
        userId:          consentLog.userId,
        userEmail:       users.email,
        visitorId:       consentLog.visitorId,
        consentType:     consentLog.consentType,
        action:          consentLog.action,
        documentVersion: consentLog.documentVersion,
        details:         consentLog.details,
        ipAddress:       consentLog.ipAddress,
        userAgent:       consentLog.userAgent,
        createdAt:       consentLog.createdAt,
      })
      .from(consentLog)
      .leftJoin(users, eq(users.id, consentLog.userId))
      .where(where)
      .orderBy(desc(consentLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(consentLog).where(where),
  ])

  const [summary] = await db
    .select({
      total:          count(),
      cookieCount:    sql<number>`count(*) filter (where ${consentLog.consentType} = 'cookie')`.mapWith(Number),
      privacyCount:   sql<number>`count(*) filter (where ${consentLog.consentType} = 'privacy_policy')`.mapWith(Number),
      marketingCount: sql<number>`count(*) filter (where ${consentLog.consentType} = 'marketing')`.mapWith(Number),
      acceptedCount:  sql<number>`count(*) filter (where ${consentLog.action} = 'accepted')`.mapWith(Number),
      rejectedCount:  sql<number>`count(*) filter (where ${consentLog.action} = 'rejected')`.mapWith(Number),
    })
    .from(consentLog)

  return NextResponse.json({
    rows: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    page,
    pageSize: PAGE_SIZE,
    summary,
  })
}
