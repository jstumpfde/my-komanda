import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { departments } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/modules/hr/departments/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as {
      name?: string
      description?: string
      parentId?: string | null
      headUserId?: string | null
      sortOrder?: number
    }

    const [updated] = await db
      .update(departments)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
        ...(body.headUserId !== undefined && { headUserId: body.headUserId }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        updatedAt: new Date(),
      })
      .where(and(eq(departments.id, id), eq(departments.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Отдел не найден", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE /api/modules/hr/departments/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Отдел не найден", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
