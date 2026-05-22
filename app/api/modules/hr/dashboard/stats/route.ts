import { eq, and, count, isNull, gte, inArray, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { ACTIVE_VACANCY_STATUSES } from "@/lib/vacancies/filters"

export async function GET(req: Request) {
  try {
    const user = await requireCompany()
    const companyId = user.companyId

    // #49: опциональный фильтр по vacancyId — применяем ко всем счётчикам
    // (кроме списка vacancies и активных вакансий — это сами вакансии).
    const url = new URL(req.url)
    const vacancyIdParam = url.searchParams.get("vacancyId")
    const vacancyFilter: SQL | undefined = vacancyIdParam && vacancyIdParam !== "all"
      ? eq(candidates.vacancyId, vacancyIdParam)
      : undefined

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // All queries in parallel
    const [
      [activeVacanciesResult],
      [totalCandidatesResult],
      [candidatesInWorkResult],
      [candidatesTodayResult],
      [hiredThisMonthResult],
      stageCounts,
      vacancyRows,
    ] = await Promise.all([
      // 1. Active vacancies count
      db.select({ value: count() })
        .from(vacancies)
        .where(and(
          eq(vacancies.companyId, companyId),
          inArray(vacancies.status, ACTIVE_VACANCY_STATUSES),
          isNull(vacancies.deletedAt),
        )),

      // 2. Total candidates (across company vacancies)
      db.select({ value: count() })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          vacancyFilter,
        )),

      // 2b. Candidates currently "in work" — расширил до полного списка
      // активных стадий, чтобы метрика «Прошли демо» (#51) была честной.
      db.select({ value: count() })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          inArray(candidates.stage, [
            "demo_opened","anketa_filled","ai_screening","test_task_sent",
            "test_task_done","scheduled","interview","interviewed",
            "reference_check","decision","offer_sent","final_decision","offer","hired",
          ]),
          vacancyFilter,
        )),

      // 2c. Candidates created today (Europe/Moscow timezone)
      db.select({ value: count() })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          sql`${candidates.createdAt} >= (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')`,
          vacancyFilter,
        )),

      // 3. Hired this month
      db.select({ value: count() })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          eq(candidates.stage, "hired"),
          gte(candidates.updatedAt, thirtyDaysAgo),
          vacancyFilter,
        )),

      // 4. Candidates grouped by stage (for funnel)
      db.select({
        stage: candidates.stage,
        vacancyId: candidates.vacancyId,
        count: count(),
      })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          vacancyFilter,
        ))
        .groupBy(candidates.stage, candidates.vacancyId),

      // 5. Active vacancies with candidate counts.
      // #34: добавил inProgressCount — кандидаты «в работе» (НЕ new, НЕ
      // rejected, НЕ hired). Это даёт честную метрику «кто сейчас в воронке».
      db.select({
        id: vacancies.id,
        title: vacancies.title,
        city: vacancies.city,
        slug: vacancies.slug,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        status: vacancies.status,
        createdAt: vacancies.createdAt,
        candidateCount: sql<number>`count(${candidates.id})::int`,
        decisionCount: sql<number>`count(case when ${candidates.stage} in ('decision', 'final_decision') then 1 end)::int`,
        inProgressCount: sql<number>`count(case when ${candidates.stage} in (
          'primary_contact','demo_opened','anketa_filled','ai_screening',
          'test_task_sent','test_task_done','scheduled','interview',
          'reference_check','decision','offer_sent'
        ) then 1 end)::int`,
      })
        .from(vacancies)
        .leftJoin(candidates, eq(candidates.vacancyId, vacancies.id))
        .where(and(
          eq(vacancies.companyId, companyId),
          inArray(vacancies.status, ACTIVE_VACANCY_STATUSES),
          isNull(vacancies.deletedAt),
        ))
        .groupBy(vacancies.id)
        .orderBy(vacancies.createdAt),
    ])

    const activeVacancies = activeVacanciesResult?.value ?? 0
    const totalCandidates = totalCandidatesResult?.value ?? 0
    const candidatesInWork = candidatesInWorkResult?.value ?? 0
    const candidatesToday = candidatesTodayResult?.value ?? 0
    const hiredThisMonth = hiredThisMonthResult?.value ?? 0
    const conversionRate = totalCandidates > 0
      ? Math.round((hiredThisMonth / totalCandidates) * 1000) / 10
      : 0

    // Aggregate funnel across all vacancies
    const funnelTotals: Record<string, number> = {}
    const funnelByVacancy: Record<string, Record<string, number>> = {}
    for (const row of stageCounts) {
      const stage = row.stage ?? "new"
      const vid = row.vacancyId
      funnelTotals[stage] = (funnelTotals[stage] ?? 0) + row.count
      if (!funnelByVacancy[vid]) funnelByVacancy[vid] = {}
      funnelByVacancy[vid][stage] = (funnelByVacancy[vid][stage] ?? 0) + row.count
    }

    return apiSuccess({
      kpi: { activeVacancies, totalCandidates, candidatesInWork, candidatesToday, hiredThisMonth, conversionRate },
      vacancies: vacancyRows,
      funnel: { totals: funnelTotals, byVacancy: funnelByVacancy },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/dashboard/stats]", err)
    return apiError("Internal server error", 500)
  }
}
