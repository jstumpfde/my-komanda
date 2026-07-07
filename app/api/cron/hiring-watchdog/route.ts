// POST/GET /api/cron/hiring-watchdog
//
// «Сторож найма» (Юрий 07.07): периодически проверяет, что по вакансиям
// компаний всё работает (hh-соединение, импорт откликов, разбор очереди,
// отправки, кроны, AI-скоринг). Что может — чинит сам (единственная
// авто-починка: отмена недоставляемых дожимов на старую публикацию hh;
// авто-сброс claimed убран на ревью — нет claimed_at, см. checks.ts), что не
// может — пишет алерт в admin_alerts: CRITICAL летит в Telegram немедленно,
// warning только в UI-баннере (components/dashboard/admin-alerts-banner.tsx).
//
// Защищён X-Cron-Secret. Запись в cron_runs через startCronRun/finishCronRun.
// Cooldown 10 минут между успешными запусками (по образцу funnel-v2-tick).
//
// Расписание на сервере (crontab — каждые 10 минут):
//   */10 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/hiring-watchdog \
//     >> /var/log/hiring-watchdog.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { runHiringWatchdog, WATCHDOG_DEDUP_PREFIXES } from "@/lib/hiring-watchdog/checks"
import { upsertAlert, autoResolveStale, notifyIfCritical } from "@/lib/hiring-watchdog/alert-store"
import { shouldNotifyTelegram } from "@/lib/hiring-watchdog/classify"

const CRON_NAME = "hiring-watchdog"
const MIN_COOLDOWN_MS = 10 * 60_000 // 10 минут

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
  try {
    const result = await runHiringWatchdog()

    let created = 0
    let skippedExisting = 0
    let criticalNotified = 0
    for (const issue of result.issues) {
      const { created: isNew } = await upsertAlert(issue)
      if (isNew) created++
      else skippedExisting++
      // Telegram — ТОЛЬКО если алерт реально создан этим прогоном (isNew):
      // при гонке с параллельным прогоном insert вернул 0 строк → нотификацию
      // шлёт победитель, здесь не дублируем. Чистое решение — shouldNotifyTelegram.
      if (shouldNotifyTelegram(issue.severity, isNew)) {
        await notifyIfCritical(issue)
        criticalNotified++
      }
    }

    const currentDedupKeys = result.issues.map((i) => i.dedupKey)
    const { resolved } = await autoResolveStale(currentDedupKeys, WATCHDOG_DEDUP_PREFIXES)

    const meta = {
      issuesFound: result.issues.length,
      alertsCreated: created,
      alertsSkippedExisting: skippedExisting,
      criticalNotified,
      autoResolved: resolved,
      fixes: result.fixes,
    }
    console.log(JSON.stringify({ tag: "cron/hiring-watchdog", ...meta, ts: new Date().toISOString() }))

    if (run) await finishCronRun(run.id, "ok", meta)
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[cron/hiring-watchdog] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
