// GET/POST /api/cron/ai-rop-process
//
// Обрабатывает очередь звонков/взаимодействий AI-РОП (rop_calls) по ВСЕМ
// компаниям платформы: pending / failed (attempts<3) / no_recording
// (attempts<10 и не трогали ≥12 мин — Bitrix прикрепляет запись с задержкой) /
// «зависшие» в processing-статусах >10 мин (воркер/процесс умер посреди
// обработки — реанимируем в pending). Порт call-agent scripts/worker.ts
// (queueLoop) под cron-модель платформы: вместо бесконечного цикла с 5-сек
// поллингом — один вызов раз в минуту с тайм-бюджетом ~50с, звонки
// обрабатываются последовательно (processCall), чтобы не запускать два
// разбора одного звонка параллельно.
//
// Раз в сутки (по метке в platform_settings) — лёгкая TTL-очистка старых
// завершённых звонков (settings.recordingsRetentionDays на компанию, дефолт
// 30 дней): удаляет строку rop_calls (каскадом транскрипт/анализ/расхождения)
// и файл записи с диска, если он есть.
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в минуту):
//   * * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-process \
//     >> /var/log/ai-rop-process.log 2>&1
import fs from "fs"
import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, platformSettings, ropSettings } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { processCall } from "@/lib/ai-rop/pipeline"
import { getSettingsJson } from "@/lib/ai-rop/settings"

const CRON_NAME = "ai-rop-process"

const MAX_ATTEMPTS = 3
const MAX_NO_RECORDING_ATTEMPTS = 10
const NO_RECORDING_RETRY_MINUTES = 12
const STALE_MINUTES = 10
const TIME_BUDGET_MS = 50_000
const BATCH_FETCH_LIMIT = 100
const TTL_MARKER_KEY = "ai_rop_ttl_cleanup_last_run"
const DEFAULT_RETENTION_DAYS = 30

const PROCESSING_STATUSES = ["downloading", "transcribing", "analyzing", "syncing"] as const

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const t0 = Date.now()

  let requeuedStale = 0
  let processed = 0
  let succeeded = 0
  let failed = 0
  let noRecording = 0
  let budgetExceeded = 0
  let ttl: { checked: number; deleted: number } | null = null

  try {
    // 1. Реанимация «зависших» — воркер/процесс умер посреди обработки.
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60_000)
    const requeued = await db
      .update(ropCalls)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(inArray(ropCalls.status, [...PROCESSING_STATUSES]), lt(ropCalls.updatedAt, staleThreshold)))
      .returning({ id: ropCalls.id })
    requeuedStale = requeued.length

    // 2. Батч на обработку — FIFO по всем компаниям (createdAt ASC), с приоритетом
    //    pending > failed > зависшие(уже requeued=pending) > no_recording.
    const noRecordingThreshold = new Date(Date.now() - NO_RECORDING_RETRY_MINUTES * 60_000)
    const due = await db
      .select({ id: ropCalls.id, tenantId: ropCalls.tenantId, status: ropCalls.status })
      .from(ropCalls)
      .where(
        or(
          eq(ropCalls.status, "pending"),
          and(eq(ropCalls.status, "failed"), lt(ropCalls.attempts, MAX_ATTEMPTS)),
          and(
            eq(ropCalls.status, "no_recording"),
            lt(ropCalls.attempts, MAX_NO_RECORDING_ATTEMPTS),
            lte(ropCalls.updatedAt, noRecordingThreshold),
          ),
        ),
      )
      .orderBy(sql`CASE ${ropCalls.status} WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END`, ropCalls.createdAt)
      .limit(BATCH_FETCH_LIMIT)

    // 3. Последовательная обработка с тайм-бюджетом.
    for (const call of due) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break
      processed++
      try {
        await processCall(call.id, call.tenantId)
        succeeded++
      } catch (e) {
        const err = e as Error
        const msg = err.message || String(e)
        if (err.name === "NoRecordingError") {
          noRecording++
          await db.update(ropCalls).set({ status: "no_recording", error: msg, updatedAt: new Date() }).where(eq(ropCalls.id, call.id))
        } else if (err.name === "BudgetExceededError") {
          budgetExceeded++
          await db.update(ropCalls).set({ status: "budget_exceeded", error: msg, updatedAt: new Date() }).where(eq(ropCalls.id, call.id))
        } else {
          failed++
          await db.update(ropCalls).set({ status: "failed", error: msg, updatedAt: new Date() }).where(eq(ropCalls.id, call.id))
        }
        console.error(`[cron/${CRON_NAME}] call ${call.id} (company ${call.tenantId}):`, msg)
      }
    }

    // 4. TTL-очистка — не чаще раза в сутки (метка в platform_settings).
    const today = new Date().toISOString().slice(0, 10)
    const [marker] = await db.select().from(platformSettings).where(eq(platformSettings.key, TTL_MARKER_KEY)).limit(1)
    const lastRunDate = (marker?.value as { date?: string } | null)?.date ?? null
    if (lastRunDate !== today) {
      ttl = await runTtlCleanup()
      await db
        .insert(platformSettings)
        .values({ key: TTL_MARKER_KEY, value: { date: today } })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: { date: today }, updatedAt: new Date() } })
    }

    const result = { requeuedStale, processed, succeeded, failed, noRecording, budgetExceeded, ttl, durationMs: Date.now() - t0 }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", { requeuedStale, processed, succeeded, failed, noRecording, budgetExceeded }, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * TTL-очистка завершённых звонков старше settings.recordingsRetentionDays
 * (дефолт 30) на компанию. Удаляет строку rop_calls (каскад — транскрипт/
 * анализ/расхождения/crm-log) и файл записи с диска, если он есть. Затрагивает
 * только терминальные статусы (done/failed/no_recording/budget_exceeded) —
 * активные в очереди никогда не трогаем. Батч ограничен на прогон, чтобы не
 * держать долгую транзакцию по всей платформе разом.
 */
async function runTtlCleanup(): Promise<{ checked: number; deleted: number }> {
  const settingsRows = await db.select().from(ropSettings)
  let checked = 0
  let deleted = 0

  for (const row of settingsRows) {
    const retentionDays = (() => {
      const n = getSettingsJson(row).recordingsRetentionDays
      return typeof n === "number" && n > 0 ? n : DEFAULT_RETENTION_DAYS
    })()
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600_000)

    const candidates = await db
      .select({ id: ropCalls.id, recordingPath: ropCalls.recordingPath })
      .from(ropCalls)
      .where(
        and(
          eq(ropCalls.tenantId, row.companyId),
          inArray(ropCalls.status, ["done", "failed", "no_recording", "budget_exceeded"]),
          lt(ropCalls.createdAt, cutoff),
        ),
      )
      .limit(200)
    checked += candidates.length

    for (const c of candidates) {
      try {
        if (c.recordingPath) {
          try {
            fs.unlinkSync(c.recordingPath)
          } catch {
            // файла уже нет/недоступен — не блокируем удаление строки
          }
        }
        await db.delete(ropCalls).where(eq(ropCalls.id, c.id))
        deleted++
      } catch (e) {
        console.warn(`[cron/${CRON_NAME}] ttl-cleanup: не удалось удалить звонок ${c.id}:`, (e as Error).message)
      }
    }
  }

  return { checked, deleted }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
