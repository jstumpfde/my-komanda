import { NextRequest } from "next/server"
import { eq, and, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_STAGES = ["new", "demo", "scheduled", "interviewed", "hired", "rejected"] as const

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()

    const vacancyId = req.nextUrl.searchParams.get("vacancy_id")
    if (!vacancyId) {
      return apiError("Missing 'vacancy_id' query parameter", 400)
    }

    // Verify the vacancy belongs to the user's company
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Vacancy not found", 404)
    }

    // Parse optional stage filter: ?stage=new,demo,scheduled
    const stageParam = req.nextUrl.searchParams.get("stage")
    const stageFilter = stageParam
      ? stageParam.split(",").filter((s) => (VALID_STAGES as readonly string[]).includes(s))
      : null

    const conditions = [eq(candidates.vacancyId, vacancyId)]
    if (stageFilter && stageFilter.length > 0) {
      conditions.push(inArray(candidates.stage, stageFilter))
    }

    const rows = await db
      .select()
      .from(candidates)
      .where(and(...conditions))
      .orderBy(desc(candidates.createdAt))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
