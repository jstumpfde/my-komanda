import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integrators, integratorLevels, companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rows = await db
    .select({
      id:           integrators.id,
      status:       integrators.status,
      joinedAt:     integrators.joinedAt,
      contactName:  integrators.contactName,
      contactEmail: integrators.contactEmail,
      contactPhone: integrators.contactPhone,
      companyId:    integrators.companyId,
      companyName:  companies.name,
      levelId:      integrators.levelId,
      levelName:    integratorLevels.name,
    })
    .from(integrators)
    .leftJoin(companies, eq(integrators.companyId, companies.id))
    .leftJoin(integratorLevels, eq(integrators.levelId, integratorLevels.id))

  return NextResponse.json({ integrators: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json() as {
    companyId: string
    levelId?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
  }

  const [created] = await db
    .insert(integrators)
    .values({
      companyId:    body.companyId,
      levelId:      body.levelId,
      contactName:  body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
    })
    .returning()

  return NextResponse.json({ integrator: created }, { status: 201 })
}
