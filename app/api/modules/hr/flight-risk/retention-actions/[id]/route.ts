import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { retentionActions } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// PATCH /api/modules/hr/flight-risk/retention-actions/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const [updated] = await db
    .update(retentionActions)
    .set({
      status:      body.status,
      title:       body.title,
      description: body.description,
      priority:    body.priority,
      outcome:     body.outcome,
      completedAt: body.status === "completed" ? new Date() : undefined,
      updatedAt:   new Date(),
    })
    .where(and(
      eq(retentionActions.id, id),
      eq(retentionActions.tenantId, session.user.companyId),
    ))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

// DELETE /api/modules/hr/flight-risk/retention-actions/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await db
    .delete(retentionActions)
    .where(and(
      eq(retentionActions.id, id),
      eq(retentionActions.tenantId, session.user.companyId),
    ))

  return NextResponse.json({ deleted: true })
}
