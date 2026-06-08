// GET/POST /api/cron/hh-vacancy-sync — обновляет состояние публикации вакансий на hh.
//
// Сигнал «в архиве hh»: вакансии нет в /employers/{id}/vacancies/active.
// Для каждой компании с привязанными вакансиями берём активный список и
// проставляем vacancies.hh_archived = (вакансии нет в активных) + hh_synced_at.
// Точную дату истечения hh работодателю не отдаёт — поэтому только архив-флаг.
//
// Защищён X-Cron-Secret. Расписание на сервере (раз в сутки достаточно):
//   30 2 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/hh-vacancy-sync >> /var/log/hh-vacancy-sync.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { getEmployerVacancies } from "@/lib/hh-api"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "hh-vacancy-sync"
const MAX_PAGES = 20

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const errors: string[] = []
  let companiesProcessed = 0
  let vacanciesUpdated = 0

  try {
    // Компании, у которых есть привязанные к hh живые вакансии.
    const companyRows = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(and(isNotNull(vacancies.hhVacancyId), isNull(vacancies.deletedAt)))
      .groupBy(vacancies.companyId)

    for (const { companyId } of companyRows) {
      const token = await getValidToken(companyId).catch(() => null)
      if (!token) { errors.push(`no_token:${companyId}`); continue }
      const employerId = token.integration.employerId
      if (!employerId) { errors.push(`no_employer:${companyId}`); continue }

      // Собираем все активные hh-id (постранично).
      const activeIds = new Set<string>()
      try {
        let page = 0
        let pages = 1
        while (page < pages && page < MAX_PAGES) {
          const resp = await getEmployerVacancies(token.accessToken, employerId, page)
          for (const it of resp.items ?? []) activeIds.add(String(it.id))
          pages = resp.pages ?? 1
          page += 1
        }
      } catch (err) {
        errors.push(`fetch:${companyId}:${err instanceof Error ? err.message : String(err)}`)
        continue
      }

      // Наши привязанные вакансии компании.
      const linked = await db
        .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
        .from(vacancies)
        .where(and(
          eq(vacancies.companyId, companyId),
          isNotNull(vacancies.hhVacancyId),
          isNull(vacancies.deletedAt),
        ))

      const now = new Date()
      for (const v of linked) {
        const archived = !activeIds.has(String(v.hhVacancyId))
        await db
          .update(vacancies)
          .set({ hhArchived: archived, hhSyncedAt: now })
          .where(eq(vacancies.id, v.id))
        vacanciesUpdated += 1
      }
      companiesProcessed += 1
    }

    const metadata = { companiesProcessed, vacanciesUpdated, errorsCount: errors.length }
    if (run) await finishCronRun(run.id, errors.length > 0 ? "error" : "ok", metadata, errors[0])
    return NextResponse.json({ ok: true, ...metadata, errors: errors.slice(0, 20) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", { companiesProcessed, vacanciesUpdated }, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
