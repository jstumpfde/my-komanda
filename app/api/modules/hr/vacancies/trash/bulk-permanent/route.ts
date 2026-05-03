import { NextRequest } from "next/server"
import { eq, and, isNotNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Bulk hard delete — permanently removes trashed vacancies.
// Body: { all: true } — wipes the entire trash for the user's company
//       { ids: string[] } — wipes only the listed trashed vacancies
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
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string" && x.length > 0) : []

    if (!isAll && ids.length === 0) {
      return apiError("Provide either { all: true } or non-empty { ids: string[] }", 400)
    }

    const whereClause = isAll
      ? and(eq(vacancies.companyId, user.companyId), isNotNull(vacancies.deletedAt))
      : and(
          eq(vacancies.companyId, user.companyId),
          isNotNull(vacancies.deletedAt),
          inArray(vacancies.id, ids),
        )

    const deleted = await db
      .delete(vacancies)
      .where(whereClause)
      .returning({ id: vacancies.id })

    return apiSuccess({ success: true, deletedCount: deleted.length })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
