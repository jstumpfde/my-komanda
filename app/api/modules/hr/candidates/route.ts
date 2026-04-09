import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"

// GET /api/modules/hr/candidates?vacancy_id=...&stage=new,demo,...
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)
    const vacancyId = url.searchParams.get("vacancy_id")
    const stageParam = url.searchParams.get("stage")

    // If no vacancy_id — return ALL candidates for this company with vacancy title
    if (!vacancyId) {
      const rows = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          phone: candidates.phone,
          email: candidates.email,
          city: candidates.city,
          source: candidates.source,
          stage: candidates.stage,
          score: candidates.score,
          aiScore: candidates.aiScore,
          vacancyId: candidates.vacancyId,
          vacancyTitle: vacancies.title,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
        })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(eq(vacancies.companyId, user.companyId))

      return apiSuccess(rows)
    }

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const stages = stageParam ? stageParam.split(",").filter(Boolean) : []

    const rows = stages.length > 0
      ? await db.select().from(candidates)
          .where(and(eq(candidates.vacancyId, vacancyId), inArray(candidates.stage, stages)))
      : await db.select().from(candidates)
          .where(eq(candidates.vacancyId, vacancyId))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/candidates — добавить кандидата вручную
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancyId: string
      name: string
      phone?: string
      email?: string
      city?: string
      source?: string
    }

    if (!body.vacancyId || !body.name) return apiError("vacancyId и name обязательны", 400)

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const [created] = await db.insert(candidates).values({
      vacancyId: body.vacancyId,
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      city: body.city ?? null,
      source: body.source ?? "manual",
      stage: "new",
      token: generateCandidateToken(),
    }).returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
