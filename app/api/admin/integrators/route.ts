import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integrators, integratorLevels, integratorClients, companies } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

function isAdmin(role?: string): boolean {
  return !!role && ["platform_admin", "platform_manager", "admin"].includes(role)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role) && !isPlatformAdminEmail(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const clientCount = db
    .select({ integratorId: integratorClients.integratorId, n: sql<number>`count(*)::int`.as("n") })
    .from(integratorClients)
    .groupBy(integratorClients.integratorId)
    .as("cc")

  const rows = await db
    .select({
      id:           integrators.id,
      kind:         integrators.kind,
      status:       integrators.status,
      billingMode:  integrators.billingMode,
      commissionPercent: integrators.commissionPercent,
      parentIntegratorId: integrators.parentIntegratorId,
      joinedAt:     integrators.joinedAt,
      contactName:  integrators.contactName,
      contactEmail: integrators.contactEmail,
      contactPhone: integrators.contactPhone,
      companyId:    integrators.companyId,
      companyName:  companies.name,
      levelId:      integrators.levelId,
      levelName:    integratorLevels.name,
      levelCommission: integratorLevels.commissionPercent,
      clientsCount: sql<number>`COALESCE(${clientCount.n}, 0)`,
    })
    .from(integrators)
    .leftJoin(companies, eq(integrators.companyId, companies.id))
    .leftJoin(integratorLevels, eq(integrators.levelId, integratorLevels.id))
    .leftJoin(clientCount, eq(clientCount.integratorId, integrators.id))

  return NextResponse.json({ integrators: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role) && !isPlatformAdminEmail(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    companyId: string
    kind?: "partner" | "sub_partner" | "referral"
    commissionPercent?: string | number
    billingMode?: "platform" | "partner"
    levelId?: string
    parentIntegratorId?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
  }
  if (!body.companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 })

  // Один integrator на компанию (companyId unique).
  const [existing] = await db.select({ id: integrators.id }).from(integrators).where(eq(integrators.companyId, body.companyId)).limit(1)
  if (existing) return NextResponse.json({ error: "У этой компании уже есть партнёрский аккаунт" }, { status: 409 })

  const pct = body.commissionPercent != null && body.commissionPercent !== ""
    ? String(body.commissionPercent)
    : null

  const [created] = await db
    .insert(integrators)
    .values({
      companyId:          body.companyId,
      kind:               body.kind ?? "partner",
      commissionPercent:  pct,
      billingMode:        body.billingMode ?? "platform",
      levelId:            body.levelId || null,
      parentIntegratorId: body.parentIntegratorId || null,
      contactName:        body.contactName,
      contactEmail:       body.contactEmail,
      contactPhone:       body.contactPhone,
    })
    .returning()

  return NextResponse.json({ integrator: created }, { status: 201 })
}
