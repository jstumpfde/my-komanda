import { NextRequest } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/demo-templates/[id]/restore — вернуть шаблон из корзины (Этап 3).
// Только свой (tenant-scoped) и только если он действительно в корзине.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [restored] = await db
      .update(demoTemplates)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(
        eq(demoTemplates.id, id),
        eq(demoTemplates.tenantId, user.companyId),
        isNotNull(demoTemplates.deletedAt),
      ))
      .returning()

    if (!restored) return apiError("Шаблон не найден в корзине", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-templates/[id]/restore]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
