import { NextRequest } from "next/server"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { hardDeleteVacancy } from "@/lib/vacancies/hard-delete"

// Hard delete — навсегда удаляет вакансию из БД (только для корзины).
// Сносит зависимые строки (кандидаты/демо/hh) ДО самой вакансии — иначе
// FK NO ACTION блокируют удаление. Логика — lib/vacancies/hard-delete.ts.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const res = await hardDeleteVacancy(id, user.companyId)
    if (!res.deleted) {
      return apiError("Vacancy not found", 404)
    }

    return apiSuccess({ deleted: true, candidates: res.candidates })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[DELETE /vacancies/[id]/permanent]", err)
    return apiError("Internal server error", 500)
  }
}
