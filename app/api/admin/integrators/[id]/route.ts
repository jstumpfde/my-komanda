import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integrators, integratorLevels, companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const [row] = await db
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
    .where(eq(integrators.id, id))

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ integrator: row })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json() as {
    levelId?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    status?: string
  }

  const [updated] = await db
    .update(integrators)
    .set({
      ...(body.levelId      !== undefined && { levelId:      body.levelId }),
      ...(body.contactName  !== undefined && { contactName:  body.contactName }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
      ...(body.status       !== undefined && { status:       body.status }),
    })
    .where(eq(integrators.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ integrator: updated })
}
