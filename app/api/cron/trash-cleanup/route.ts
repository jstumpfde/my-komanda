// GET/POST /api/cron/trash-cleanup
// Защищён X-Cron-Secret. Раз в сутки (03:00 МСК) удаляет НАВСЕГДА вакансии,
// которые лежат в корзине (vacancies.deleted_at IS NOT NULL) дольше, чем
// companies.trash_retention_days. Вместе с вакансией удаляются её кандидаты,
// демо и hh-привязки (см. lib/vacancies/hard-delete.ts). Кандидаты других
// вакансий не затрагиваются (candidates.vacancy_id один-к-одному).
//
// Crontab на сервере (см. scripts / CLAUDE.md):
//   0 0 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/trash-cleanup >> /var/log/trash-cleanup.log 2>&1
//   (00:00 UTC = 03:00 МСК)

import { NextRequest, NextResponse } from "next/server"
import { and, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { hardDeleteVacancy } from "@/lib/vacancies/hard-delete"

const CRON_NAME = "trash-cleanup"
// Предохранитель: не сносим больше N вакансий за один прогон.
const MAX_PER_RUN = 200

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    // Кандидаты на удаление: в корзине дольше, чем trash_retention_days компании.
    const due = await db
      .select({
        id:        vacancies.id,
        companyId: vacancies.companyId,
      })
      .from(vacancies)
      .innerJoin(companies, sql`${companies.id} = ${vacancies.companyId}`)
      .where(and(
        isNotNull(vacancies.deletedAt),
        sql`${vacancies.deletedAt} < now() - make_interval(days => ${companies.trashRetentionDays})`,
      ))
      .orderBy(vacancies.deletedAt)
      .limit(MAX_PER_RUN)

    let deletedVacancies = 0
    let deletedCandidates = 0
    const errors: string[] = []

    for (const v of due) {
      try {
        const res = await hardDeleteVacancy(v.id, v.companyId)
        if (res.deleted) {
          deletedVacancies++
          deletedCandidates += res.candidates
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${v.id}: ${msg}`)
        console.error("[trash-cleanup] failed to delete vacancy", v.id, msg)
      }
    }

    const metadata = {
      due:               due.length,
      deletedVacancies,
      deletedCandidates,
      errors:            errors.length,
    }
    if (run) await finishCronRun(run.id, errors.length > 0 ? "error" : "ok", metadata, errors[0])
    return NextResponse.json({ ok: true, ...metadata })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[trash-cleanup] fatal:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
