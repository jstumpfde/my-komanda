import { NextRequest } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// DELETE /api/questionnaire-templates/[id]/permanent — необратимое удаление.
// Только для шаблонов, уже лежащих в корзине (deleted_at IS NOT NULL), и только своих.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(questionnaireTemplates)
      .where(and(
        eq(questionnaireTemplates.id, id),
        eq(questionnaireTemplates.tenantId, user.companyId),
        isNotNull(questionnaireTemplates.deletedAt),
      ))
      .returning()

    if (!deleted) return apiError("Шаблон не найден в корзине", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates/[id]/permanent]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
