import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (body.serviceId !== undefined) updateData.serviceId = body.serviceId
    if (body.resourceId !== undefined) updateData.resourceId = body.resourceId || null
    if (body.clientName !== undefined) updateData.clientName = body.clientName
    if (body.clientPhone !== undefined) updateData.clientPhone = body.clientPhone
    if (body.clientEmail !== undefined) updateData.clientEmail = body.clientEmail
    if (body.date !== undefined) updateData.date = body.date
    if (body.startTime !== undefined) updateData.startTime = body.startTime
    if (body.endTime !== undefined) updateData.endTime = body.endTime
    if (body.status !== undefined) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.price !== undefined) updateData.price = body.price
    if (body.isPaid !== undefined) updateData.isPaid = body.isPaid

    const [updated] = await db
      .update(bookings)
      .set(updateData)
      .where(and(eq(bookings.id, id), eq(bookings.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [deleted] = await db
      .delete(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.tenantId, user.companyId)))
      .returning()
    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
