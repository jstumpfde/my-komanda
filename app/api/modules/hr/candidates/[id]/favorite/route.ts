import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as { isFavorite?: unknown }
    const isFavorite = body.isFavorite === true

    // Проверяем, что кандидат принадлежит компании пользователя
    const [row] = await db
      .select({ candidateId: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Candidate not found", 404)

    const [updated] = await db
      .update(candidates)
      .set({ isFavorite, updatedAt: new Date() })
      // TOCTOU-защита: UPDATE сам скоупим по компании (а не только SELECT
      // выше), чтобы между проверкой и записью нельзя было подменить
      // владельца. У candidates нет company_id — изоляция через вакансию
      // компании (тот же приём, что в stage/route.ts).
      .where(and(
        eq(candidates.id, id),
        inArray(
          candidates.vacancyId,
          db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.companyId, user.companyId)),
        ),
      ))
      .returning({ id: candidates.id, isFavorite: candidates.isFavorite })

    if (!updated) return apiError("Candidate not found", 404)

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
