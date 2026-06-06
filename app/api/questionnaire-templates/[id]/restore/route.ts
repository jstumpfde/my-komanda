import { NextRequest } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { questionnaireTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/questionnaire-templates/[id]/restore — вернуть из корзины.
// Только свой (tenant-scoped) и только если реально в корзине.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [restored] = await db
      .update(questionnaireTemplates)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(
        eq(questionnaireTemplates.id, id),
        eq(questionnaireTemplates.tenantId, user.companyId),
        isNotNull(questionnaireTemplates.deletedAt),
      ))
      .returning()

    if (!restored) return apiError("Шаблон не найден в корзине", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[questionnaire-templates/[id]/restore]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
