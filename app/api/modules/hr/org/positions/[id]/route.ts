import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { positions, positionEmployees } from "@/lib/db/schema"
import { requireOrgManager, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/modules/hr/org/positions/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireOrgManager()
    const { id } = await params
    const body = await req.json() as {
      name?: string
      departmentId?: string | null
      description?: string | null
      grade?: string | null
      salaryMin?: number | null
      salaryMax?: number | null
      userId?: string | null
      employeeIds?: string[]
    }

    // Вариант B: список сотрудников. Если передан — он источник правды,
    // legacy userId = первый сотрудник.
    const employeeIds = body.employeeIds !== undefined
      ? [...new Set((body.employeeIds ?? []).filter((x) => typeof x === "string" && x.length > 0))]
      : undefined

    const [updated] = await db
      .update(positions)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.departmentId !== undefined && { departmentId: body.departmentId }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.grade !== undefined && { grade: body.grade }),
        ...(body.salaryMin !== undefined && { salaryMin: body.salaryMin }),
        ...(body.salaryMax !== undefined && { salaryMax: body.salaryMax }),
        ...(employeeIds !== undefined
          ? { userId: employeeIds[0] ?? null }
          : (body.userId !== undefined && { userId: body.userId })),
        updatedAt: new Date(),
      })
      .where(and(eq(positions.id, id), eq(positions.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Должность не найдена", 404)

    // Перезаписываем связи сотрудников.
    if (employeeIds !== undefined) {
      await db.delete(positionEmployees).where(eq(positionEmployees.positionId, id))
      if (employeeIds.length > 0) {
        await db.insert(positionEmployees)
          .values(employeeIds.map((uid) => ({ positionId: id, userId: uid })))
          .onConflictDoNothing()
      }
    }

    return apiSuccess({ ...updated, ...(employeeIds !== undefined ? { employeeIds } : {}) })
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
    const user = await requireOrgManager()
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
