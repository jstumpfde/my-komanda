import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
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
      .where(eq(candidates.id, id))
      .returning({ id: candidates.id, isFavorite: candidates.isFavorite })

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
