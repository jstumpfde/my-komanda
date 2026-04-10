import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/demo-templates/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select()
      .from(demoTemplates)
      .where(eq(demoTemplates.id, id))
      .limit(1)

    if (!row) return apiError("Шаблон не найден", 404)
    if (!row.isSystem && row.tenantId !== user.companyId) {
      return apiError("Нет доступа", 403)
    }

    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates/[id] GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// PATCH /api/demo-templates/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const [updated] = await db
      .update(demoTemplates)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.niche !== undefined && { niche: body.niche }),
        ...(body.length !== undefined && { length: body.length }),
        ...(body.sections !== undefined && { sections: body.sections }),
        ...(Array.isArray(body.audience) && { audience: body.audience }),
        ...(typeof body.reviewCycle === "string" && { reviewCycle: body.reviewCycle }),
        ...(body.validUntil !== undefined && {
          validUntil: body.validUntil && !isNaN(Date.parse(body.validUntil)) ? new Date(body.validUntil) : null,
        }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(demoTemplates.id, id),
          eq(demoTemplates.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!updated) return apiError("Шаблон не найден или нет доступа", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates/[id] PATCH]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// DELETE /api/demo-templates/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(demoTemplates)
      .where(
        and(
          eq(demoTemplates.id, id),
          eq(demoTemplates.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!deleted) return apiError("Шаблон не найден или нет доступа", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates/[id] DELETE]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
