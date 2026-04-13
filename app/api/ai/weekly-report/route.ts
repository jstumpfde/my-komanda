import { eq, and, sql, count, avg } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const cid = user.companyId
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // New candidates this week
    const [newCandidates] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), sql`${candidates.createdAt} > ${weekAgo}`))

    // AI screenings this week
    const [screenings] = await db
      .select({ cnt: count(), avg: avg(candidates.aiScore) })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), sql`${candidates.aiScore} IS NOT NULL`, sql`${candidates.updatedAt} > ${weekAgo}`))

    // Hired this week
    const [hired] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), eq(candidates.stage, "hired"), sql`${candidates.updatedAt} > ${weekAgo}`))

    // Stale candidates
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const [stale] = await db
      .select({ cnt: count() })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, cid), eq(candidates.stage, "new"), sql`${candidates.createdAt} < ${threeDaysAgo}`))

    // Active vacancies without candidates this week
    const [emptyVacancies] = await db
      .select({ cnt: count() })
      .from(vacancies)
      .where(and(eq(vacancies.companyId, cid), eq(vacancies.status, "active")))

    const newCount = Number(newCandidates?.cnt || 0)
    const screenCount = Number(screenings?.cnt || 0)
    const avgScore = Math.round(Number(screenings?.avg || 0))
    const hiredCount = Number(hired?.cnt || 0)
    const staleCount = Number(stale?.cnt || 0)

    const recommendations: string[] = []
    if (staleCount > 0) recommendations.push(`Разберите ${staleCount} кандидатов, ожидающих более 3 дней`)
    if (newCount === 0) recommendations.push("Нет новых откликов — проверьте публикации вакансий")
    if (screenCount > 0 && avgScore < 50) recommendations.push("Средний AI-скор низкий — возможно, нужно уточнить требования в анкетах")
    if (recommendations.length === 0) recommendations.push("Всё идёт хорошо! Продолжайте в том же духе.")

    const summary = `За неделю: ${newCount} новых кандидатов, ${screenCount} AI-скринингов (ср. скор ${avgScore}), ${hiredCount} нанято.${staleCount > 0 ? ` ${staleCount} кандидатов ожидают разбора.` : ""}`

    return apiSuccess({
      summary,
      metrics: {
        newCandidates: newCount,
        aiScreenings: screenCount,
        avgAiScore: avgScore,
        hired: hiredCount,
        staleCandidates: staleCount,
      },
      recommendations,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
