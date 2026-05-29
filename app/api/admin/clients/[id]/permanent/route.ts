import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import { hardDeleteCompany } from "@/lib/companies/hard-delete"

type Params = { params: Promise<{ id: string }> }

// DELETE /api/admin/clients/[id]/permanent — необратимое удаление компании со
// всем тенантом. Разрешено ТОЛЬКО для компаний, уже лежащих в корзине
// (deleted_at IS NOT NULL) — нельзя удалить навсегда мимо корзины.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [company] = await db
    .select({ id: companies.id, deletedAt: companies.deletedAt })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)

  if (!company) return apiError("Компания не найдена", 404)
  if (!company.deletedAt) {
    return apiError("Сначала переместите компанию в корзину", 400)
  }

  const res = await hardDeleteCompany(id)
  if (!res.deleted) {
    return apiError(res.error ? `Не удалось удалить: ${res.error}` : "Не удалось удалить компанию", 500)
  }

  return apiSuccess({ deleted: true, vacancies: res.vacancies })
}
