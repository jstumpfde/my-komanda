import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { positions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/modules/hr/org/positions/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as {
      name?: string
      departmentId?: string | null
      description?: string | null
      grade?: string | null
      salaryMin?: number | null
      salaryMax?: number | null
      userId?: string | null
    }

    const [updated] = await db
      .update(positions)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.departmentId !== undefined && { departmentId: body.departmentId }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.grade !== undefined && { grade: body.grade }),
        ...(body.salaryMin !== undefined && { salaryMin: body.salaryMin }),
        ...(body.salaryMax !== undefined && { salaryMax: body.salaryMax }),
        ...(body.userId !== undefined && { userId: body.userId }),
        updatedAt: new Date(),
      })
      .where(and(eq(positions.id, id), eq(positions.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Должность не найдена", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE /api/modules/hr/org/positions/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(positions)
      .where(and(eq(positions.id, id), eq(positions.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Должность не найдена", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
