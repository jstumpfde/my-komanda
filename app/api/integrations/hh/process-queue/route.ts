import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhProcessJobs } from "@/lib/db/schema"
import { processHhQueue } from "@/lib/hh/process-queue"

// In-process map для DELETE /process-queue (кнопка «Остановить» в UI).
// Заменён на per-job из БД (status='stopped') в Сессии 7 — но ловит сигнал
// stop_flag прежний механизм для совместимости с processHhQueue.
const stopFlags = new Map<string, boolean>()

// POST — fire-and-forget: создаёт row в hh_process_jobs со status='queued',
// планирует разбор в фоне через setImmediate, сразу возвращает {jobId, status}.
// Это снимает upstream timeout от nginx (60 сек) — синхронный разбор 200
// кандидатов с rate-limit гарантированно превышает лимит.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId
  const body = await req.json().catch(() => ({}))

  // UUID-валидация vacancyId.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rawVacancyId = typeof body.vacancyId === "string" ? body.vacancyId : null
  const vacancyId = rawVacancyId && UUID_RE.test(rawVacancyId) ? rawVacancyId : undefined

  const toFiniteNumber = (v: unknown): number | undefined => {
    if (v == null) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const limit        = toFiniteNumber(body.limit)
  const delaySeconds = toFiniteNumber(body.delaySeconds)

  const [job] = await db.insert(hhProcessJobs).values({
    companyId,
    vacancyId:       vacancyId ?? null,
    status:          "queued",
    limitRequested:  limit ?? null,
    delaySeconds:    delaySeconds ?? null,
  }).returning({ id: hhProcessJobs.id })

  if (!job) {
    return NextResponse.json({ error: "Failed to enqueue job" }, { status: 500 })
  }

  // Запускаем разбор в фоне. setImmediate отдаёт текущий tick,
  // ответ улетает до старта processHhQueue.
  setImmediate(() => { void runJob(job.id, companyId, vacancyId, limit, delaySeconds) })

  console.log("[process-queue]", JSON.stringify({
    tag: "process-queue/enqueue",
    jobId: job.id, companyId, vacancyId: vacancyId ?? null, limit: limit ?? null,
  }))

  return NextResponse.json({ jobId: job.id, status: "queued" })
}

// Фоновая обработка одного job'а. Все ошибки ловим — НЕ роняем процесс.
async function runJob(
  jobId:        string,
  companyId:    string,
  vacancyId:    string | undefined,
  limit:        number | undefined,
  delaySeconds: number | undefined,
) {
  const startedAt = new Date()
  try {
    await db.update(hhProcessJobs)
      .set({ status: "running", startedAt })
      .where(eq(hhProcessJobs.id, jobId))

    console.log("[process-queue]", JSON.stringify({
      tag: "process-queue/start", jobId, companyId,
    }))

    const result = await processHhQueue({
      companyId,
      localVacancyId:      vacancyId,
      limit,
      delaySeconds,
      respectWorkingHours: false,
      stopFlags,
    })

    // Если кто-то нажал «Остановить» (DELETE) и stop_flags среагировал —
    // помечаем как 'stopped'. Иначе — 'completed'. result.noToken /
    // vacancyNotLinked трактуем как 'failed' с описательным error'ом.
    let finalStatus: "completed" | "failed" | "stopped" = "completed"
    let errorText: string | null = null
    if (result.noToken) {
      finalStatus = "failed"
      errorText = "hh.ru не подключён"
    } else if (result.vacancyNotLinked) {
      finalStatus = "failed"
      errorText = "Вакансия не привязана к hh.ru"
    } else if (result.results.some(r => r.action === "stopped")) {
      finalStatus = "stopped"
    }

    await db.update(hhProcessJobs).set({
      status:           finalStatus,
      processed:        result.processed,
      invited:          result.invited,
      rejected:         result.rejected,
      kept:             result.kept,
      deferredOffHours: result.deferredOffHours,
      results:          result.results,
      error:            errorText,
      finishedAt:       new Date(),
    }).where(eq(hhProcessJobs.id, jobId))

    console.log("[process-queue]", JSON.stringify({
      tag:       "process-queue/finish",
      jobId,
      status:    finalStatus,
      processed: result.processed,
      invited:   result.invited,
      durationMs: Date.now() - startedAt.getTime(),
      reason:    errorText,
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[process-queue]", JSON.stringify({
      tag: "process-queue/error", jobId, error: msg.slice(0, 500),
    }))
    await db.update(hhProcessJobs).set({
      status:     "failed",
      error:      msg.slice(0, 500),
      finishedAt: new Date(),
    }).where(eq(hhProcessJobs.id, jobId))
  }
}

// DELETE — стоп. Помечаем все running job'ы компании stop-флагом и
// отдельным помечанием status='stopped' (после того, как run-цикл выйдет).
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const companyId = session.user.companyId
  stopFlags.set(companyId, true)
  // queued-job'ы тоже стопаем — их runJob ещё не начал, но если попадут
  // в setImmediate-очередь, processHhQueue сразу выйдет по stop-flag'у.
  await db.update(hhProcessJobs)
    .set({ status: "stopped", finishedAt: new Date() })
    .where(and(
      eq(hhProcessJobs.companyId, companyId),
      eq(hhProcessJobs.status, "queued"),
    ))
  return NextResponse.json({ stopped: true })
}
