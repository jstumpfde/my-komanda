import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_TYPES = ["candidate", "client", "post_demo"]

// GET /api/questionnaire-templates/[id] — системный или свой.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select()
      .from(questionnaireTemplates)
      .where(eq(questionnaireTemplates.id, id))
      .limit(1)

    if (!row) return apiError("Шаблон не найден", 404)
    if (!row.isSystem && row.tenantId !== user.companyId) {
      return apiError("Нет доступа", 403)
    }

    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates/[id] GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// PATCH /api/questionnaire-templates/[id] — обновить свой (системные tenant-scoped → 404).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const [updated] = await db
      .update(questionnaireTemplates)
      .set({
        ...(typeof body.name === "string" && body.name.trim() && { name: body.name.trim().substring(0, 120) }),
        ...(typeof body.type === "string" && VALID_TYPES.includes(body.type) && { type: body.type }),
        ...(Array.isArray(body.questions) && { questions: body.questions }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(questionnaireTemplates.id, id),
          eq(questionnaireTemplates.tenantId, user.companyId),
        ),
      )
      .returning()

    if (!updated) return apiError("Шаблон не найден или нет доступа", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates/[id] PATCH]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

// DELETE /api/questionnaire-templates/[id] — soft-delete (в корзину). Системные нельзя.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: questionnaireTemplates.id, isSystem: questionnaireTemplates.isSystem, tenantId: questionnaireTemplates.tenantId })
      .from(questionnaireTemplates)
      .where(eq(questionnaireTemplates.id, id))
      .limit(1)

    if (!existing) return apiError("Шаблон не найден", 404)
    if (existing.isSystem) return apiError("Нельзя удалить системный шаблон", 400)
    if (existing.tenantId !== user.companyId) return apiError("Нет доступа", 403)

    const [deleted] = await db
      .update(questionnaireTemplates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(questionnaireTemplates.id, id), eq(questionnaireTemplates.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Шаблон не найден или нет доступа", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates/[id] DELETE]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
