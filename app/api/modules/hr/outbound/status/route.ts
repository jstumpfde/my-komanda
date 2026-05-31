// GET /api/modules/hr/outbound/status?vacancyId=
//
// Возвращает статус исходящего подбора для вакансии:
//   - активен ли доступ к базе резюме hh
//   - использовано/осталось из дневного лимита просмотров
//   - момент последнего запуска поиска
//   - связана ли вакансия с hh (для дизейбла кнопки «Пригласить»)
//
// Tenant guard: company_id = user.companyId.

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, outboundSearches } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { checkResumeDatabaseAccess, DAILY_SEARCH_VIEW_LIMIT, DAILY_TOTAL_VIEW_LIMIT } from "@/lib/hh/outbound"
import { getQuota } from "@/lib/hh/outbound-quota"

export async function GET(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const companyId = user.companyId

  const { searchParams } = new URL(req.url)
  const vacancyId = searchParams.get("vacancyId")
  if (!vacancyId) return apiError("vacancyId обязателен", 400)

  const [vac] = await db
    .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return apiError("Вакансия не найдена", 404)

  const quota = await getQuota(companyId)

  // Доступ к базе резюме hh — best-effort probe. Если hh не подключён вовсе,
  // probe кинет и вернёт hasAccess=false с причиной.
  let access: { hasAccess: boolean; reason?: string }
  try {
    access = await checkResumeDatabaseAccess(companyId)
  } catch (err) {
    access = { hasAccess: false, reason: err instanceof Error ? err.message : "hh недоступен" }
  }

  const [lastSearch] = await db
    .select({ lastRunAt: outboundSearches.lastRunAt })
    .from(outboundSearches)
    .where(and(eq(outboundSearches.vacancyId, vacancyId), eq(outboundSearches.companyId, companyId)))
    .orderBy(desc(outboundSearches.lastRunAt))
    .limit(1)

  return apiSuccess({
    hhVacancyLinked: !!vac.hhVacancyId,
    databaseAccess: {
      active: access.hasAccess,
      reason: access.reason ?? null,
    },
    quota: {
      date: quota.date,
      searchLimit: DAILY_SEARCH_VIEW_LIMIT,
      viewsFromSearch: quota.viewsFromSearch,
      searchRemaining: quota.searchRemaining,
      totalLimit: DAILY_TOTAL_VIEW_LIMIT,
      totalViews: quota.totalViews,
      totalRemaining: quota.totalRemaining,
      exhausted: quota.exhausted,
    },
    lastRunAt: lastSearch?.lastRunAt ?? null,
  })
}
