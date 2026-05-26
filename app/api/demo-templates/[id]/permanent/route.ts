import { NextRequest } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// DELETE /api/demo-templates/[id]/permanent — необратимое удаление (Этап 3).
// Разрешено ТОЛЬКО для шаблонов, которые уже в корзине (deleted_at IS NOT NULL),
// и только своих (tenant-scoped). Системные (tenantId != companyId) не трогаются.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(demoTemplates)
      .where(and(
        eq(demoTemplates.id, id),
        eq(demoTemplates.tenantId, user.companyId),
        isNotNull(demoTemplates.deletedAt),
      ))
      .returning()

    if (!deleted) return apiError("Шаблон не найден в корзине", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates/[id]/permanent]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
