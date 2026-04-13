import { eq, and, sql, count, avg } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const cid = user.companyId

    // Vacancy counts by status
    const vacancyStats = await db
      .select({ status: vacancies.status, cnt: count() })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, cid), sql`${vacancies.deletedAt} IS NULL`))
      .groupBy(vacancies.status)

    const vacancyByStatus: Record<string, number> = {}
    let totalVacancies = 0
    for (const v of vacancyStats) {
      vacancyByStatus[v.status || "draft"] = Number(v.cnt)
      totalVacancies += Number(v.cnt)
    }

    // Candidate stats
    const [candidateTotal] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(eq(vacancies.companyId, cid))

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [newThisWeek] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), sql`${candidates.createdAt} > ${sevenDaysAgo}`))

    const [avgScore] = await db
      .select({ avg: avg(candidates.aiScore) })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), sql`${candidates.aiScore} IS NOT NULL`))

    // Candidates by stage
    const stageStats = await db
      .select({ stage: candidates.stage, cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(eq(vacancies.companyId, cid))
      .groupBy(candidates.stage)

    const candidateByStage: Record<string, number> = {}
    for (const s of stageStats) {
      candidateByStage[s.stage || "new"] = Number(s.cnt)
    }

    // Stale candidates (new > 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const [staleCount] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), eq(candidates.stage, "new"), sql`${candidates.createdAt} < ${threeDaysAgo}`))

    return apiSuccess({
      totalVacancies,
      activeVacancies: vacancyByStatus["active"] || 0,
      totalCandidates: Number(candidateTotal?.cnt || 0),
      newThisWeek: Number(newThisWeek?.cnt || 0),
      avgAiScore: Math.round(Number(avgScore?.avg || 0)),
      vacancyByStatus,
      candidateByStage,
      staleCandidates: Number(staleCount?.cnt || 0),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
