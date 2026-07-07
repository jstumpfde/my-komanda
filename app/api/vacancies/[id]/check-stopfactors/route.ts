import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { checkStopFactors, type CandidateData } from "@/lib/stopfactors"
import { toAnketaStopFactors } from "@/lib/funnel-builder/anketa-stop-factors-bridge"

// unify 07.07 (инцидент вакансии 2604V023): раньше читал descriptionJson.
// anketa.stopFactors — декоративный карман, никогда не совпадающий с боевым
// vacancies.stop_factors_json (тем, что реально применяет process-queue).
// Нет ни одного клиентского вызова этого роута в кодовой базе на момент
// правки (проверено grep'ом) — оставлен для будущего использования, но
// переключён на единственный источник истины, чтобы не возродить путаницу,
// если роут когда-нибудь подключат к UI.
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
        stopFactorsJson: vacancies.stopFactorsJson,
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

    const stopFactors = toAnketaStopFactors(vacancy.stopFactorsJson)

    const result = checkStopFactors(stopFactors, body.candidateData)

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
