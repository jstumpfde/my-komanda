import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integratorLevels } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["platform_admin", "platform_manager"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rows = await db.select().from(integratorLevels).orderBy(integratorLevels.sortOrder)
  return NextResponse.json({ levels: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "platform_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    name: string
    minClients?: number
    minMrrKopecks?: number
    commissionPercent: string
    sortOrder?: number
  }

  const [created] = await db
    .insert(integratorLevels)
    .values({
      name:              body.name,
      minClients:        body.minClients ?? 0,
      minMrrKopecks:     body.minMrrKopecks ?? 0,
      commissionPercent: body.commissionPercent,
      sortOrder:         body.sortOrder ?? 0,
    })
    .returning()

  return NextResponse.json({ level: created }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "platform_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const body = await req.json() as {
    name?: string
    minClients?: number
    minMrrKopecks?: number
    commissionPercent?: string
    sortOrder?: number
    isActive?: boolean
  }

  const [updated] = await db
    .update(integratorLevels)
    .set({
      ...(body.name              !== undefined && { name:              body.name }),
      ...(body.minClients        !== undefined && { minClients:        body.minClients }),
      ...(body.minMrrKopecks     !== undefined && { minMrrKopecks:     body.minMrrKopecks }),
      ...(body.commissionPercent !== undefined && { commissionPercent: body.commissionPercent }),
      ...(body.sortOrder         !== undefined && { sortOrder:         body.sortOrder }),
      ...(body.isActive          !== undefined && { isActive:          body.isActive }),
    })
    .where(eq(integratorLevels.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ level: updated })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "platform_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  await db.delete(integratorLevels).where(eq(integratorLevels.id, id))
  return NextResponse.json({ ok: true })
}
