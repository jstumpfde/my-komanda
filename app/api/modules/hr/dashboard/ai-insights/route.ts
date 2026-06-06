// GET /api/modules/hr/dashboard/ai-insights
//
// #33: подсказки-инсайты на дашборде HR — SQL-based, без LLM-вызовов.
// 4 карточки:
//   1) hot       — самая горячая вакансия (max new candidates за 7д)
//   2) stuck     — кандидаты в primary_contact > 24ч без ответа
//   3) topScores — кандидаты с AI-score >= 80 в anketa_filled
//   4) weekConv  — конверсия (% открывших демо из новых) за 7 дней

import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getStageLabel } from "@/lib/stages"

export async function GET(req: Request) {
  try {
    const user = await requireCompany()
    const companyId = user.companyId

    // #49: ?vacancyId= фильтрует все инсайты на одну вакансию
    const url = new URL(req.url)
    const vacancyIdParam = url.searchParams.get("vacancyId")
    const vacancyFilter: SQL | undefined = vacancyIdParam && vacancyIdParam !== "all"
      ? eq(candidates.vacancyId, vacancyIdParam)
      : undefined

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000)
    const oneDayAgo    = new Date(now.getTime() - 1 * 86_400_000)

    const [
      hotRow,
      stuckRow,
      topScoresRow,
      weekConvRows,
    ] = await Promise.all([
      // 1) Hot vacancy
      db.select({
        vacancyId: candidates.vacancyId,
        title:     vacancies.title,
        cnt:       sql<number>`count(*)::int`,
      })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          gte(candidates.createdAt, sevenDaysAgo),
          vacancyFilter,
        ))
        .groupBy(candidates.vacancyId, vacancies.title)
        .orderBy(sql`count(*) DESC`)
        .limit(1),

      // 2) Stuck — кандидаты в primary_contact > 24h
      db.select({ cnt: sql<number>`count(*)::int` })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          eq(candidates.stage, "primary_contact"),
          sql`${candidates.updatedAt} < ${oneDayAgo.toISOString()}`,
          vacancyFilter,
        )),

      // 3) High AI-score in anketa_filled
      db.select({ cnt: sql<number>`count(*)::int` })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          eq(candidates.stage, "anketa_filled"),
          sql`${candidates.aiScore} >= 80`,
          vacancyFilter,
        )),

      // 4) Конверсия demo open / total за неделю
      db.select({
        total:      sql<number>`count(*)::int`,
        demoOpened: sql<number>`count(*) filter (where ${candidates.stage} != 'new')::int`,
      })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(and(
          eq(vacancies.companyId, companyId),
          isNull(vacancies.deletedAt),
          gte(candidates.createdAt, sevenDaysAgo),
          vacancyFilter,
        )),
    ])

    const hot = hotRow[0]
    const stuck = stuckRow[0]?.cnt ?? 0
    const topScores = topScoresRow[0]?.cnt ?? 0
    const weekTotal = weekConvRows[0]?.total ?? 0
    const weekOpen  = weekConvRows[0]?.demoOpened ?? 0
    const weekConv  = weekTotal > 0
      ? Math.round((weekOpen / weekTotal) * 100)
      : 0

    return apiSuccess({
      insights: [
        {
          key:         "hot_vacancy",
          title:       "Самая горячая",
          value:       hot ? String(hot.cnt) : "0",
          description: hot ? `${hot.title} · откликов за 7 дней` : "Нет данных за 7 дней",
          link:        hot ? `/hr/vacancies/${hot.vacancyId}` : null,
        },
        {
          key:         "stuck_candidates",
          title:       "Висят без ответа",
          value:       String(stuck),
          description: stuck > 0 ? `${getStageLabel("primary_contact")} · 24+ часов` : "Все актуальны",
          link:        "/hr/candidates?stage=primary_contact",
        },
        {
          key:         "top_scores",
          title:       "Топ-кандидаты ждут",
          value:       String(topScores),
          description: topScores > 0 ? "AI-score ≥ 80, в анкете" : "Пока никого с высоким скором",
          link:        "/hr/candidates?stage=anketa_filled",
        },
        {
          key:         "week_conversion",
          title:       "Открыли демо",
          value:       `${weekConv}%`,
          description: weekTotal > 0 ? `${weekOpen} из ${weekTotal} за 7 дней` : "Откликов за неделю не было",
          link:        null,
        },
      ],
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/dashboard/ai-insights]", err)
    return apiError("Internal server error", 500)
  }
}
