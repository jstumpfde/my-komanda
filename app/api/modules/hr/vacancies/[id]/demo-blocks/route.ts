import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getVacancyDemoButtonBlocks } from "@/lib/demo/vacancy-demo-blocks"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// GET /api/modules/hr/vacancies/[id]/demo-blocks
//
// Демо-блоки вакансии для быстрых кнопок «Демо 1»…«Демо N» в чате кандидата
// (candidate-drawer). Единый формат ссылки строит клиент из этих блоков +
// длинного token кандидата (см. lib/demo/demo-quick-links.ts).
// Тенант-изоляция: вакансия должна принадлежать компании пользователя.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    const demoBlocks = await getVacancyDemoButtonBlocks(id)
    return apiSuccess({ demoBlocks, baseUrl: getAppBaseUrl() })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[vacancy demo-blocks GET]", err)
    return apiError("Internal server error", 500)
  }
}
