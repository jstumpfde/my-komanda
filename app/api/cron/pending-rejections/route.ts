// GET/POST /api/cron/pending-rejections
// Защищён X-Cron-Secret. Исполняет ОТЛОЖЕННЫЕ отказы: кандидаты, у которых
// pending_rejection_at наступил, переводятся в rejected + сообщение/discard в hh
// (executeRejection). Срабатывает ТОЛЬКО в рабочее время вакансии (canSendNow) —
// чтобы отказы не уходили ночью и не валились в эфир одновременно с утренними
// приглашениями. Мгновенных авто-отказов в системе нет: всё идёт через эту
// очередь (задержка vacancy.aiProcessSettings.rejectionDelayMinutes, дефолт 300).
//
// Crontab на сервере (раз в ~5 минут):
//   */5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/pending-rejections >> /var/log/pending-rejections.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNotNull, lte, sql } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { canSendNow, type VacancySchedule } from "@/lib/schedule/can-send-now"
import { executeRejection } from "@/lib/rejection/execute"

const CRON_NAME = "pending-rejections"
const MAX_PER_RUN = 50

// Защита от параллельных запусков: если предыдущий прогон завис (медленный
// hh), новый видел те же строки до смены stage и кандидат мог получить отказ
// дважды. Лок держим на ЗАРЕЗЕРВИРОВАННОМ соединении (pgClient.reserve) —
// при пуле lock/unlock отдельными запросами могут попасть в разные
// соединения, и lock зависнет навсегда. Ключ в диапазоне 747000x cron-локов.
const PENDING_REJECTIONS_LOCK_KEY = 7470002

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const lockConn = await pgClient.reserve()
  let lockAcquired = false
  try {
    const lockRows = await lockConn`SELECT pg_try_advisory_lock(${PENDING_REJECTIONS_LOCK_KEY}) AS acquired`
    lockAcquired = lockRows?.[0]?.acquired === true
    if (!lockAcquired) {
      return NextResponse.json({ ok: false, busy: true }, { status: 409 })
    }
    return await run_(req)
  } finally {
    if (lockAcquired) {
      await lockConn`SELECT pg_advisory_unlock(${PENDING_REJECTIONS_LOCK_KEY})`.catch(() => {})
    }
    lockConn.release()
  }
}

async function run_(_req: NextRequest) {
  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    // Кандидаты с наступившим сроком отказа + поля расписания их вакансии.
    const due = await db
      .select({
        candidateId: candidates.id,
        reason:      candidates.pendingRejectionReason,
        stage:       candidates.stage,
        vac: {
          scheduleEnabled:            vacancies.scheduleEnabled,
          scheduleStart:              vacancies.scheduleStart,
          scheduleEnd:                vacancies.scheduleEnd,
          scheduleTimezone:           vacancies.scheduleTimezone,
          scheduleWorkingDays:        vacancies.scheduleWorkingDays,
          scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
          scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
        },
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(and(
        isNotNull(candidates.pendingRejectionAt),
        lte(candidates.pendingRejectionAt, sql`now()`),
        sql`${candidates.stage} <> 'rejected'`,
      ))
      .orderBy(candidates.pendingRejectionAt)
      .limit(MAX_PER_RUN)

    let rejected = 0
    let deferredOffHours = 0
    const errors: string[] = []

    for (const row of due) {
      // Рабочее время вакансии: вне его — пропускаем, отказ ждёт след. прогона.
      const sched = canSendNow(row.vac as VacancySchedule)
      if (!sched.allowed) { deferredOffHours++; continue }

      try {
        const res = await executeRejection({
          candidateId: row.candidateId,
          reason:      row.reason ?? "delayed_rejection",
        })
        if (res.rejected) rejected++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${row.candidateId}: ${msg}`)
        console.error("[pending-rejections] failed", row.candidateId, msg)
      }
    }

    const metadata = { due: due.length, rejected, deferredOffHours, errors: errors.length }
    if (run) await finishCronRun(run.id, errors.length > 0 ? "error" : "ok", metadata, errors[0])
    return NextResponse.json({ ok: true, ...metadata })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[pending-rejections] fatal:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
