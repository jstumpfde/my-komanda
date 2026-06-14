import { NextRequest } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { hardDeleteVacancy } from "@/lib/vacancies/hard-delete"

// Bulk hard delete — permanently removes trashed vacancies.
// Body: { all: true } — wipes the entire trash for the user's company
//       { ids: string[] } — wipes only the listed trashed vacancies
//
// Важно: удаляем через hardDeleteVacancy (сносит зависимые строки —
// кандидатов/демо/hh ДО самой вакансии). Прямой db.delete(vacancies)
// падал на FK NO ACTION → 500 → «Не удалось удалить навсегда».
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()

    const body = (await req.json().catch(() => null)) as
      | { all?: boolean; ids?: string[] }
      | null

    if (!body) {
      return apiError("Invalid request body", 400)
    }

    const isAll = body.all === true
    const requestedIds = Array.isArray(body.ids)
      ? body.ids.filter((x) => typeof x === "string" && x.length > 0)
      : []

    if (!isAll && requestedIds.length === 0) {
      return apiError("Provide either { all: true } or non-empty { ids: string[] }", 400)
    }

    // Целевые id — только из корзины (deleted_at IS NOT NULL) этой компании.
    const trashed = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, user.companyId), isNotNull(vacancies.deletedAt)))

    const requestedSet = new Set(requestedIds)
    const targetIds = isAll
      ? trashed.map((r) => r.id)
      : trashed.map((r) => r.id).filter((id) => requestedSet.has(id))

    let deletedCount = 0
    const failed: string[] = []
    for (const id of targetIds) {
      try {
        const res = await hardDeleteVacancy(id, user.companyId)
        if (res.deleted) deletedCount++
      } catch (err) {
        console.error("[bulk-permanent] failed for", id, err)
        failed.push(id)
      }
    }

    if (failed.length > 0 && deletedCount === 0) {
      return apiError("Failed to permanently delete vacancies", 500)
    }

    return apiSuccess({ success: true, deletedCount, failedCount: failed.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /vacancies/trash/bulk-permanent]", err)
    return apiError("Internal server error", 500)
  }
}
