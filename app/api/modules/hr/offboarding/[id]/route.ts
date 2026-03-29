import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { offboardingCases } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// GET /api/modules/hr/offboarding/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [c] = await db
    .select()
    .from(offboardingCases)
    .where(and(eq(offboardingCases.id, id), eq(offboardingCases.tenantId, session.user.companyId)))
    .limit(1)

  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(c)
}

// PATCH /api/modules/hr/offboarding/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const [updated] = await db
    .update(offboardingCases)
    .set({
      status:         body.status,
      checklistJson:  body.checklistJson,
      referralBridge: body.referralBridge,
      rehireEligible: body.rehireEligible,
      notes:          body.notes,
      lastWorkDay:    body.lastWorkDay ? new Date(body.lastWorkDay) : undefined,
      updatedAt:      new Date(),
    })
    .where(and(eq(offboardingCases.id, id), eq(offboardingCases.tenantId, session.user.companyId)))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
