import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { checkStopFactors, type CandidateData, type StopFactor } from "@/lib/stopfactors"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select({
        id: vacancies.id,
        descriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    const body = await req.json() as { candidateData: CandidateData }
    if (!body.candidateData) {
      return apiError("candidateData обязательно", 400)
    }

    const descJson = vacancy.descriptionJson as Record<string, unknown> | null
    const anketa = descJson?.anketa as Record<string, unknown> | undefined
    const stopFactors = (anketa?.stopFactors as StopFactor[]) || []

    const result = checkStopFactors(stopFactors, body.candidateData)

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
