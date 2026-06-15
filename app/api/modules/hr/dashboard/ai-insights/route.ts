// GET /api/modules/hr/dashboard/ai-insights
//
// Подсказки-инсайты на дашборде HR — SQL-based, без LLM-вызовов.
// Action-oriented (всегда «что делать сейчас», а не окно 7д/24ч):
//   1) needReply  — новые отклики, не взятые в работу (stage=new)
//   2) strongStuck— сильные по резюме (resume_score≥70), застрявшие на ранних стадиях
//   3) readyDecide— прошли ключевые этапы, ждут вердикта HR
//   4) bottleneck — узкое место воронки (мид-стадия, где больше всего застряло)

import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getStageLabel } from "@/lib/stages"

const RESUME_STRONG = 70
const EARLY_STAGES = ["new", "primary_contact", "demo_opened"]
const DECISION_READY = ["anketa_filled", "ai_screening", "test_passed", "interview", "reference_check", "decision"]
const BOTTLENECK_STAGES = ["primary_contact", "demo_opened", "anketa_filled", "ai_screening"]

export async function GET(req: Request) {
  try {
    const user = await requireCompany()
    const companyId = user.companyId

    // ?vacancyId= фильтрует все инсайты на одну вакансию
    const url = new URL(req.url)
    const vacancyIdParam = url.searchParams.get("vacancyId")
    const vacancyFilter: SQL | undefined = vacancyIdParam && vacancyIdParam !== "all"
      ? eq(candidates.vacancyId, vacancyIdParam)
      : undefined

    const base = (extra: SQL | undefined) => and(
      eq(vacancies.companyId, companyId),
      isNull(vacancies.deletedAt),
      vacancyFilter,
      extra,
    )

    const cntFrom = (extra: SQL | undefined) =>
      db.select({ cnt: sql<number>`count(*)::int` })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(base(extra))

    const [
      needReplyRow,
      strongStuckRow,
      readyRow,
      bottleneckRows,
    ] = await Promise.all([
      // 1) Новые отклики, не в работе
      cntFrom(eq(candidates.stage, "new")),

      // 2) Сильные по резюме, застрявшие рано
      cntFrom(and(
        sql`${candidates.resumeScore} >= ${RESUME_STRONG}`,
        inArray(candidates.stage, EARLY_STAGES),
      )),

      // 3) Прошли ключевые этапы — ждут вердикта HR
      cntFrom(inArray(candidates.stage, DECISION_READY)),

      // 4) Узкое место — мид-стадия с макс. числом застрявших
      db.select({ stage: candidates.stage, cnt: sql<number>`count(*)::int` })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(base(inArray(candidates.stage, BOTTLENECK_STAGES)))
        .groupBy(candidates.stage)
        .orderBy(sql`count(*) DESC`)
        .limit(1),
    ])

    const needReply = needReplyRow[0]?.cnt ?? 0
    const strongStuck = strongStuckRow[0]?.cnt ?? 0
    const ready = readyRow[0]?.cnt ?? 0
    const bottleneck = bottleneckRows[0]

    return apiSuccess({
      insights: [
        {
          key:         "need_reply",
          title:       "Требуют ответа",
          value:       String(needReply),
          description: needReply > 0 ? "Новые отклики, не в работе" : "Новых без ответа нет",
          link:        "/hr/candidates?stage=new",
        },
        {
          key:         "strong_stuck",
          title:       "Сильные без движения",
          value:       String(strongStuck),
          description: strongStuck > 0 ? `Резюме ≥ ${RESUME_STRONG}, застряли рано` : "Топы не застряли",
          link:        "/hr/candidates",
        },
        {
          key:         "ready_decide",
          title:       "Готовы к решению",
          value:       String(ready),
          description: ready > 0 ? "Прошли этапы — ждут вердикта" : "Пока некого решать",
          link:        "/hr/candidates?stage=decision",
        },
        {
          key:         "bottleneck",
          title:       "Узкое место",
          value:       bottleneck ? String(bottleneck.cnt) : "0",
          description: bottleneck
            ? `${getStageLabel(bottleneck.stage)} · больше всего застряло`
            : "Воронка без затыков",
          link:        bottleneck ? `/hr/candidates?stage=${bottleneck.stage}` : null,
        },
      ],
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/dashboard/ai-insights]", err)
    return apiError("Internal server error", 500)
  }
}
