import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookingServices } from "@/lib/db/schema"
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
      .update(bookingServices)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.duration !== undefined && { duration: body.duration }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        updatedAt: new Date(),
      })
      .where(and(eq(bookingServices.id, id), eq(bookingServices.tenantId, user.companyId)))
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
      .delete(bookingServices)
      .where(and(eq(bookingServices.id, id), eq(bookingServices.tenantId, user.companyId)))
      .returning()
    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
