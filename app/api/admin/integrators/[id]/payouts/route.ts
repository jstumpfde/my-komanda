import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { integratorPayouts } from "@/lib/db/schema"
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
    .select()
    .from(integratorPayouts)
    .where(eq(integratorPayouts.integratorId, id))

  return NextResponse.json({ payouts: rows })
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
  const body = await req.json() as {
    periodStart: string
    periodEnd: string
    totalMrrKopecks: number
    commissionPercent: string
  }

  const payoutKopecks = Math.round(body.totalMrrKopecks * parseFloat(body.commissionPercent) / 100)

  const [created] = await db
    .insert(integratorPayouts)
    .values({
      integratorId:     id,
      periodStart:      new Date(body.periodStart),
      periodEnd:        new Date(body.periodEnd),
      totalMrrKopecks:  body.totalMrrKopecks,
      commissionPercent: body.commissionPercent,
      payoutKopecks,
    })
    .returning()

  return NextResponse.json({ payout: created }, { status: 201 })
}
