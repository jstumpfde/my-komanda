import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integratorClients, companies } from "@/lib/db/schema"
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

  const rows = await db
    .select({
      id:              integratorClients.id,
      integratorId:    integratorClients.integratorId,
      clientCompanyId: integratorClients.clientCompanyId,
      referredAt:      integratorClients.referredAt,
      companyName:     companies.name,
    })
    .from(integratorClients)
    .leftJoin(companies, eq(integratorClients.clientCompanyId, companies.id))
    .where(eq(integratorClients.integratorId, id))

  return NextResponse.json({ clients: rows })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { clientCompanyId } = await req.json() as { clientCompanyId: string }

  const [created] = await db
    .insert(integratorClients)
    .values({ integratorId: id, clientCompanyId })
    .returning()

  return NextResponse.json({ client: created }, { status: 201 })
}
