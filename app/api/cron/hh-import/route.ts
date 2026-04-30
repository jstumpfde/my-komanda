// POST /api/cron/hh-import
// Защищён X-Cron-Secret. Каждые ~10 минут импортирует новые отклики с hh.ru
// по всем активным hh-вакансиям компаний и сразу запускает разбор:
//   • если рабочее время вакансии (canSendNow) — создаём кандидата,
//     шлём демо-приглашение, переводим стадию, расписываем follow-up;
//   • иначе оставляем status='response' до следующего cron'а.
// Лимит на разбор — 30 откликов в одном вызове, чтобы не топить hh API.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhVacancies, vacancies, hhTokens, hhResponses } from "@/lib/db/schema"
import { and, eq, count } from "drizzle-orm"
import { HHClient } from "@/lib/hh/client"
import { checkCronAuth } from "@/lib/cron/auth"
import { processHhQueue } from "@/lib/hh/process-queue"

const PROCESS_LIMIT_PER_RUN = 30

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  let imported  = 0
  let processed = 0
  let deferredOffHours = 0
  let skipped   = 0
  const errors: string[] = []

  try {
    // Все активные hh-вакансии всех компаний.
    const activeRows = await db
      .select({
        hhVacancyId: hhVacancies.hhVacancyId,
        vacancyId:   hhVacancies.localVacancyId,
        companyId:   vacancies.companyId,
      })
      .from(hhVacancies)
      .innerJoin(vacancies, eq(hhVacancies.localVacancyId, vacancies.id))
      .where(eq(hhVacancies.status, "active"))

    // Группируем по компании — каждой компании один токен и один проход разбора.
    const byCompany = new Map<string, typeof activeRows>()
    for (const row of activeRows) {
      const list = byCompany.get(row.companyId) ?? []
      list.push(row)
      byCompany.set(row.companyId, list)
    }

    for (const [companyId, rows] of byCompany.entries()) {
      // Без токена hh — пропускаем компанию.
      const tokenRows = await db
        .select()
        .from(hhTokens)
        .where(eq(hhTokens.companyId, companyId))
        .limit(1)
      if (!tokenRows[0]) {
        skipped++
        continue
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
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[hh-import] top-level:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    imported,
    processed,
    deferredOffHours,
    skipped,
    errors,
  })
}
