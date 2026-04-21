import { NextRequest } from "next/server"
import { eq, and, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const vacancyRows = await db
      .select({ id: vacancies.id, companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, id))
      .limit(1)

    if (vacancyRows.length === 0) {
      return apiError("Вакансия не найдена", 404)
    }

    const vacancy = vacancyRows[0]

    const existing = await db
      .select({ token: candidates.token })
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, id),
        like(candidates.token, "test-demo-preview-%"),
      ))
      .limit(1)

    if (existing.length > 0 && existing[0].token) {
      return apiSuccess({ url: `/demo/${existing[0].token}`, token: existing[0].token })
    }

    const token = `test-demo-preview-${Math.floor(Math.random() * 90000000 + 10000000)}`

    await db.insert(candidates).values({
      vacancyId: id,
      companyId: vacancy.companyId,
      name: "Тестовый кандидат",
      token,
      stage: "new",
      source: "preview",
    } as any)

    return apiSuccess({ url: `/demo/${token}`, token })
  } catch (err) {
    console.error("GET preview-link error", err)
    return apiError("Internal server error", 500)
  }
}
