/**
 * GET/POST /api/cron/hh-negotiation-sync — входящий синк стадий hh → платформа (#23).
 *
 * Читает актуальное negotiation-состояние кандидатов на hh по всем активным
 * hh-привязанным вакансиям и двигает НАШУ стадию кандидата, если hh-состояние
 * маппится в нашу стадию и отличается (lib/hh/sync-inbound-stages.ts +
 * центральная карта lib/hh/stage-mapping.ts).
 *
 * Отказ кандидата на hh (discard_by_applicant) → наша стадия rejected с
 * rejectionInitiator=candidate. Отказ работодателя (discard_by_employer) →
 * rejected с initiator=company.
 *
 * Защита: X-Cron-Secret. Запись в cron_runs (startCronRun/finishCronRun).
 * Cooldown: 5 минут между успешными запусками.
 *
 * ГАРД: вакансии без валидного hh-токена (стейджинг — токены отключены)
 * пропускаются штатно, без краша.
 *
 * НЕ добавлен в crontab — включается вручную на проде. Рекомендуемое
 * расписание (например, раз в 15 минут):
 * ```
 * *\/15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
 *   https://company24.pro/api/cron/hh-negotiation-sync \
 *   >> /var/log/hh-negotiation-sync.log 2>&1
 * ```
 */

import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { syncInboundHhStagesAllActive } from "@/lib/hh/sync-inbound-stages"

const CRON_NAME = "hh-negotiation-sync"
const MIN_COOLDOWN_MS = 5 * 60_000 // 5 минут между успешными запусками

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Cooldown
  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_COOLDOWN_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "too_recent",
      lastOk: lastOk.toISOString(),
    })
  }

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const startedAt = Date.now()

  try {
    const res = await syncInboundHhStagesAllActive()
    const durationMs = Date.now() - startedAt
    const meta = {
      vacanciesProcessed: res.vacanciesProcessed,
      vacanciesSkipped: res.vacanciesSkipped,
      candidatesChecked: res.candidatesChecked,
      moved: res.moved,
      errors: res.errors,
      durationMs,
    }
    console.log(JSON.stringify({ tag: "cron/hh-negotiation-sync", ...meta, ts: new Date().toISOString() }))
    if (run) await finishCronRun(run.id, res.errors > 0 ? "error" : "ok", meta)
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[cron/hh-negotiation-sync] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
