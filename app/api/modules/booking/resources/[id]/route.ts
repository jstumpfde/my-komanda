import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookingResources } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const [updated] = await db
      .update(bookingResources)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.schedule !== undefined && { schedule: body.schedule }),
        ...(body.breaks !== undefined && { breaks: body.breaks }),
        updatedAt: new Date(),
      })
      .where(and(eq(bookingResources.id, id), eq(bookingResources.tenantId, user.companyId)))
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
      .delete(bookingResources)
      .where(and(eq(bookingResources.id, id), eq(bookingResources.tenantId, user.companyId)))
      .returning()
    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
