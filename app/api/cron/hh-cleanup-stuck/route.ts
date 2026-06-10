// POST /api/cron/hh-cleanup-stuck
// Защищён X-Cron-Secret. Однократный (или вызываемый из /hh-import) проход
// по hh_responses со status='response', чей привязанный candidate уже
// в терминальной стадии (rejected/hired) или с auto_processing_stopped=true.
// Такие отклики никогда не должны попадать в очередь разбора — переводим
// их в status='orphaned', чтобы processHhQueue не упирался в них при
// ORDER BY createdAt ASC LIMIT N.
//
// Этот endpoint — самостоятельный (для ручного запуска через cron-runner),
// и одновременно вызывается из /hh-import в самом начале каждого прогона.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies } from "@/lib/db/schema"
import { and, eq, inArray, or } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "hh-cleanup-stuck"

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const result = await runCleanup()
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[cron/hh-cleanup-stuck]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Экспортируется для использования из /api/cron/hh-import — там не нужно
// HTTP-обёртки, дёрнем функцию напрямую.
export async function runCleanup(): Promise<{ orphaned: number; companies: number }> {
  // Один SQL — найти hh_responses со status='response', чей localCandidateId
  // ссылается на candidate в стадии rejected/hired или с автостопом.
  // Не требует JOIN'а, потому что мы вычисляем stuck-IDs одной выборкой
  // по компаниям с активными hh-вакансиями. Для безопасности ограничиваем
  // максимум 1000 строк за прогон.
  const stuckCandidates = await db
    .select({ id: candidates.id, companyId: vacancies.companyId })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(or(
      inArray(candidates.stage, ["rejected", "hired"]),
      eq(candidates.autoProcessingStopped, true),
    ))

  if (stuckCandidates.length === 0) {
    return { orphaned: 0, companies: 0 }
  }

  // Группируем stuck-IDs по компании — отдельный UPDATE per company,
  // чтобы PG не строил гигантский IN-список из 10к+ uuid'ов на одну строку.
  const byCompany = new Map<string, string[]>()
  for (const row of stuckCandidates) {
    const list = byCompany.get(row.companyId) ?? []
    list.push(row.id)
    byCompany.set(row.companyId, list)
  }

  let total = 0
  for (const [companyId, ids] of byCompany.entries()) {
    if (ids.length === 0) continue
    const updated = await db.update(hhResponses)
      .set({ status: "orphaned" })
      .where(and(
        eq(hhResponses.companyId, companyId),
        eq(hhResponses.status, "response"),
        inArray(hhResponses.localCandidateId, ids),
      ))
      .returning({ id: hhResponses.id })
    total += updated.length
  }

  if (total > 0) {
    console.log("[hh-cleanup-stuck]", JSON.stringify({
      tag: "hh-cleanup-stuck/orphaned",
      orphaned: total,
      companies: byCompany.size,
    }))
  }

  return { orphaned: total, companies: byCompany.size }
}
