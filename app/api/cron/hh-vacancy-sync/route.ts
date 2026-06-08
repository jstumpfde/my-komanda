// GET/POST /api/cron/hh-vacancy-sync — обновляет состояние публикации вакансий на hh.
//
// Сигнал «в архиве hh» берём из ДЕТАЛЬНОГО объекта /vacancies/{id} (поле archived).
// /employers/{id}/vacancies/active для части работодателей возвращает пустой список
// (требует manager_id/иной скоуп) — поэтому НЕ используем его, чтобы не пометить
// архивом всё подряд. Деталь по каждой вакансии — авторитетна.
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
import { getVacancy } from "@/lib/hh-api"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "hh-vacancy-sync"
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

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

      // Наши привязанные вакансии компании.
      const linked = await db
        .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
        .from(vacancies)
        .where(and(
          eq(vacancies.companyId, companyId),
          isNotNull(vacancies.hhVacancyId),
          isNull(vacancies.deletedAt),
        ))

      let touched = false
      for (const v of linked) {
        try {
          const detail = await getVacancy(token.accessToken, String(v.hhVacancyId))
          // archived есть только в детальном объекте; если поле не пришло —
          // не трогаем флаг (консервативно, чтобы не выставить ложный архив).
          if (typeof detail.archived !== "boolean") { errors.push(`no_archived_field:${v.hhVacancyId}`); continue }
          await db
            .update(vacancies)
            .set({ hhArchived: detail.archived, hhSyncedAt: new Date() })
            .where(eq(vacancies.id, v.id))
          vacanciesUpdated += 1
          touched = true
        } catch (err) {
          // 404 = вакансия удалена/скрыта на hh → считаем архивной; прочие
          // ошибки (сеть/429/5xx) — пропускаем, флаг не меняем.
          const msg = err instanceof Error ? err.message : String(err)
          if (/\b404\b/.test(msg)) {
            await db.update(vacancies).set({ hhArchived: true, hhSyncedAt: new Date() }).where(eq(vacancies.id, v.id))
            vacanciesUpdated += 1
            touched = true
          } else {
            errors.push(`fetch:${v.hhVacancyId}:${msg}`)
          }
        }
        await sleep(250) // вежливо к hh rate-limit
      }
      if (touched) companiesProcessed += 1
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
