// GET /api/modules/hr/vacancies/[id]/compare?ids=c1,c2,c3
// Единая выборка ответов нескольких кандидатов для страницы сравнения.
// Данные собирает lib/compare/build-comparison.ts (общий хелпер с публичным
// роутом по share-токену).
import { eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { buildComparison } from "@/lib/compare/build-comparison"

const MAX_COMPARE = 50

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params
    const url = new URL(req.url)
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE)
    if (ids.length === 0) return apiError("ids required", 400)

    const [vac] = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    const result = await buildComparison(vacancyId, ids)
    if (result.candidates.length === 0) return apiError("No candidates", 404)

    // Город + дата рождения — только в HR-роуте (в публичную ссылку не отдаём).
    const info = await db
      .select({ id: candidates.id, city: candidates.city, birthDate: candidates.birthDate })
      .from(candidates)
      .where(inArray(candidates.id, ids))
    const infoById = new Map(info.map((r) => [r.id, r]))
    const candidatesWithInfo = result.candidates.map((c) => ({
      ...c,
      city: infoById.get(c.id)?.city ?? null,
      birthDate: infoById.get(c.id)?.birthDate ?? null,
    }))

    return apiSuccess({ ...result, candidates: candidatesWithInfo })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
