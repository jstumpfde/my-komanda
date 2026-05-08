// POST /api/cron/hh-import-burst
//
// Разовый «пакетный» вызов hh-импорта — внутри одного процесса делает N итераций
// /api/cron/hh-import с задержкой между ними. Используется UI-кнопкой «Разобрать
// всё» на странице вакансии, чтобы пользователь не дёргал endpoint руками
// 50 раз для разбора 388 откликов.
//
// Body: { iterations?: number, delayMs?: number }
//   iterations: 1..50 (default 10) — сколько раз вызвать обработку
//   delayMs:    0..30000 (default 1000) — пауза между итерациями
//
// Защита от параллелизма — через тот же advisory_lock в /api/cron/hh-import:
// если основной cron уже идёт, итерация увидит 409 и пропустится.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhVacancies, vacancies, hhTokens, hhResponses } from "@/lib/db/schema"
import { and, eq, count, sql } from "drizzle-orm"
import { HHClient } from "@/lib/hh/client"
import { checkCronAuth } from "@/lib/cron/auth"
import { processHhQueue } from "@/lib/hh/process-queue"

const PROCESS_LIMIT_PER_RUN = 50
const HH_IMPORT_LOCK_KEY = 7470001

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

interface IterationResult {
  imported:         number
  processed:        number
  deferredOffHours: number
  skipped:          number
  errors:           string[]
  busy?:            true
}

// Один прогон импорта — копия тела /api/cron/hh-import без HTTP-обёртки.
// Возвращает busy=true, если advisory_lock не удалось взять (значит, прямо
// сейчас другой cron-вызов уже обрабатывает очередь).
async function runOneIteration(): Promise<IterationResult> {
  const lockRows = await db.execute(
    sql`SELECT pg_try_advisory_lock(${HH_IMPORT_LOCK_KEY}) AS acquired`,
  ) as unknown as Array<{ acquired: boolean }>
  const acquired = lockRows?.[0]?.acquired === true
  if (!acquired) {
    return { imported: 0, processed: 0, deferredOffHours: 0, skipped: 0, errors: [], busy: true }
  }

  let imported = 0
  let processed = 0
  let deferredOffHours = 0
  let skipped = 0
  const errors: string[] = []

  try {
    const activeRows = await db
      .select({
        hhVacancyId:           hhVacancies.hhVacancyId,
        vacancyId:             hhVacancies.localVacancyId,
        companyId:             vacancies.companyId,
        autoProcessingEnabled: vacancies.autoProcessingEnabled,
      })
      .from(hhVacancies)
      .innerJoin(vacancies, eq(hhVacancies.localVacancyId, vacancies.id))
      .where(and(
        eq(hhVacancies.status, "active"),
        eq(vacancies.autoProcessingEnabled, true),
      ))

    const byCompany = new Map<string, typeof activeRows>()
    for (const row of activeRows) {
      const list = byCompany.get(row.companyId) ?? []
      list.push(row)
      byCompany.set(row.companyId, list)
    }

    await Promise.all(Array.from(byCompany.entries()).map(async ([companyId, rows]) => {
      const tokenRows = await db
        .select()
        .from(hhTokens)
        .where(eq(hhTokens.companyId, companyId))
        .limit(1)
      if (!tokenRows[0]) { skipped++; return }

      const client = new HHClient(companyId)
      for (const row of rows) {
        if (!row.vacancyId) continue
        try {
          const r = await client.importApplications(row.vacancyId)
          imported += r.imported
        } catch (err) {
          errors.push(`vacancy ${row.vacancyId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      try {
        const [{ pending }] = await db
          .select({ pending: count() })
          .from(hhResponses)
          .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response")))
        if (pending > 0) {
          const result = await processHhQueue({
            companyId,
            limit:               Math.min(pending, PROCESS_LIMIT_PER_RUN),
            delaySeconds:        2,
            respectWorkingHours: true,
          })
          processed        += result.invited
          deferredOffHours += result.deferredOffHours
        }
      } catch (err) {
        errors.push(`processQueue ${companyId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }))
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${HH_IMPORT_LOCK_KEY})`).catch(() => {})
  }

  return { imported, processed, deferredOffHours, skipped, errors }
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({})) as { iterations?: number; delayMs?: number }
  const iterations = Math.min(Math.max(Number(body.iterations) || 10, 1), 50)
  const delayMs    = Math.min(Math.max(Number(body.delayMs) || 1000, 0), 30_000)

  let totalImported = 0
  let totalProcessed = 0
  let totalDeferred = 0
  let totalSkipped = 0
  let busyHits = 0
  const allErrors: string[] = []
  const perIteration: Array<Pick<IterationResult, "imported" | "processed" | "deferredOffHours">> = []

  for (let i = 0; i < iterations; i++) {
    const r = await runOneIteration()
    if (r.busy) {
      busyHits++
      // если основной cron сейчас работает — пропускаем итерацию и ждём
      if (i < iterations - 1) await sleep(delayMs)
      continue
    }
    totalImported  += r.imported
    totalProcessed += r.processed
    totalDeferred  += r.deferredOffHours
    totalSkipped   += r.skipped
    if (r.errors.length > 0) allErrors.push(...r.errors)
    perIteration.push({
      imported:         r.imported,
      processed:        r.processed,
      deferredOffHours: r.deferredOffHours,
    })
    // Если в итерации ничего не разобрали и не импортировали — очередь пуста, выходим
    if (r.imported === 0 && r.processed === 0 && r.deferredOffHours === 0) break
    if (i < iterations - 1) await sleep(delayMs)
  }

  return NextResponse.json({
    ok: true,
    iterationsRequested: iterations,
    iterationsRun:       perIteration.length,
    busyHits,
    totalImported,
    totalProcessed,
    totalDeferred,
    totalSkipped,
    perIteration,
    errors: allErrors.slice(0, 20),
    errorsCount: allErrors.length,
  })
}
