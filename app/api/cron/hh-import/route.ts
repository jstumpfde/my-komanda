// POST /api/cron/hh-import
// Защищён X-Cron-Secret. Каждые ~2 минуты импортирует новые отклики с hh.ru
// по всем активным hh-вакансиям компаний и сразу запускает разбор:
//   • если рабочее время вакансии (canSendNow) — создаём кандидата,
//     шлём демо-приглашение, переводим стадию, расписываем follow-up;
//   • иначе оставляем status='response' до следующего cron'а.
//
// Лимит на разбор — PROCESS_LIMIT_PER_RUN откликов на компанию за один вызов
// (выставлен в 50, чтобы 388 откликов разбирались за 8 циклов вместо 49).
//
// Защита от параллельных запусков: pg_try_advisory_lock с фиксированным ключом.
// Если предыдущий cron ещё работает — возвращаем 409 «busy», не делаем
// повторный INSERT/обновление по тем же откликам.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhVacancies, vacancies, hhTokens, hhResponses, companies } from "@/lib/db/schema"
import { and, eq, count, sql, inArray } from "drizzle-orm"
import { HHClient } from "@/lib/hh/client"
import { checkCronAuth } from "@/lib/cron/auth"
import { processHhQueue } from "@/lib/hh/process-queue"
import { isWorkingHours, describeNowIn, DEFAULT_WORKING_HOURS } from "@/lib/utils/working-hours"

// Лимит откликов в обработку за один вызов cron'а — на компанию.
// 50 — компромисс: hh API per-employer rate-limit ≈ 60 rps, в коде
// последовательная обработка с delaySeconds=2 на отклик (т.е. ~50×2=100 сек).
// Поднимать выше — рискуем тайм-аутом серверлесс-функции.
const PROCESS_LIMIT_PER_RUN = 50

// Стабильный ключ pg_advisory_lock. int4 (Postgres принимает int4/int8) —
// сознательно держим в безопасном диапазоне, чтобы не конфликтовать с
// будущими ключами других cron'ов. Менять только если меняется семантика.
const HH_IMPORT_LOCK_KEY = 7470001

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Пробуем взять advisory lock. true → можно работать; false → предыдущий
  // cron ещё в процессе, выходим с 409 (Conflict, идемпотентно — клиент знает,
  // что обработка уже идёт, и можно подождать).
  const lockRows = await db.execute(
    sql`SELECT pg_try_advisory_lock(${HH_IMPORT_LOCK_KEY}) AS acquired`,
  ) as unknown as Array<{ acquired: boolean }>
  const acquired = lockRows?.[0]?.acquired === true
  if (!acquired) {
    return NextResponse.json(
      { ok: false, busy: true, error: "hh-import already running, try later" },
      { status: 409 },
    )
  }

  let imported  = 0
  let processed = 0
  let deferredOffHours = 0
  let skipped   = 0
  let skippedOffHoursCompanies = 0
  const errors: string[] = []

  try {
    // Все активные hh-вакансии всех компаний с включённым авто-разбором.
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

    // Группируем по компании — каждой компании один токен и один проход разбора.
    const byCompany = new Map<string, typeof activeRows>()
    for (const row of activeRows) {
      const list = byCompany.get(row.companyId) ?? []
      list.push(row)
      byCompany.set(row.companyId, list)
    }

    // Working-hours фильтр: до importApplications (=> до hh API). Цель — не
    // долбить hh.ru ночью/в выходные/в праздники. Источник правды —
    // companies.working_hours JSONB (миграция 0092). NULL → DEFAULT_WORKING_HOURS.
    const companyIds = Array.from(byCompany.keys())
    const workingHoursByCompany = new Map<string, typeof DEFAULT_WORKING_HOURS | null>()
    if (companyIds.length > 0) {
      const rows = await db
        .select({ id: companies.id, workingHours: companies.workingHours })
        .from(companies)
        .where(inArray(companies.id, companyIds))
      for (const r of rows) workingHoursByCompany.set(r.id, r.workingHours ?? null)
    }

    // Параллельная обработка компаний — каждая компания идёт своим потоком.
    // Внутри компании (importApplications + processHhQueue) сохраняется
    // последовательность, чтобы не словить 429 от hh.ru на одном employer.
    await Promise.all(Array.from(byCompany.entries()).map(async ([companyId, rows]) => {
      const schedule = workingHoursByCompany.get(companyId) ?? null
      if (!isWorkingHours(schedule)) {
        skippedOffHoursCompanies++
        const tz = schedule?.tz ?? DEFAULT_WORKING_HOURS.tz
        console.info(`[hh-import] company ${companyId} off-hours (${describeNowIn(tz)}) — skip`)
        return
      }
      // Без токена hh — пропускаем компанию.
      const tokenRows = await db
        .select()
        .from(hhTokens)
        .where(eq(hhTokens.companyId, companyId))
        .limit(1)
      if (!tokenRows[0]) {
        skipped++
        return
      }

      // Шаг 1 — импорт новых откликов в hh_responses (status='response').
      const client = new HHClient(companyId)
      for (const row of rows) {
        // INNER JOIN гарантирует non-null, но schema разрешает null —
        // на всякий случай защищаемся.
        if (!row.vacancyId) continue
        const localVacancyId = row.vacancyId
        try {
          const r = await client.importApplications(localVacancyId)
          imported += r.imported
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[hh-import] vacancy ${localVacancyId} failed:`, msg)
          errors.push(`vacancy ${localVacancyId}: ${msg}`)
        }
      }

      // Шаг 2 — разбор накопленных откликов с уважением рабочих часов.
      // Лимит общий на компанию (а не на каждую вакансию), чтобы один прогон
      // cron'а не превышал PROCESS_LIMIT_PER_RUN.
      try {
        const [{ pending }] = await db
          .select({ pending: count() })
          .from(hhResponses)
          .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response")))
        if (pending > 0) {
          const result = await processHhQueue({
            companyId,
            limit:               Math.min(pending, PROCESS_LIMIT_PER_RUN),
            delaySeconds:        2,    // быстрее чем ручной (там 30), но щадяще
            respectWorkingHours: true,
          })
          processed        += result.invited
          deferredOffHours += result.deferredOffHours
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[hh-import] processQueue company ${companyId} failed:`, msg)
        errors.push(`processQueue ${companyId}: ${msg}`)
      }
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[hh-import] top-level:", msg)
    // Lock освобождаем даже на throw — иначе следующий cron получит 409 навсегда
    // (или до restart процесса, что хуже).
    await db.execute(sql`SELECT pg_advisory_unlock(${HH_IMPORT_LOCK_KEY})`).catch(() => {})
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  await db.execute(sql`SELECT pg_advisory_unlock(${HH_IMPORT_LOCK_KEY})`).catch(() => {})

  return NextResponse.json({
    ok: true,
    imported,
    processed,
    deferredOffHours,
    skipped,
    skippedOffHoursCompanies,
    errors,
  })
}
