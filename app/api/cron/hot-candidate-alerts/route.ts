// Батч «конверсия демо» (координатор+Юрий, 05.07): «горячий кандидат стынет».
// GET/POST /api/cron/hot-candidate-alerts — защищён X-Cron-Secret.
//
// Сканирует кандидатов с открытым, но не начатым демо (см.
// lib/demo/hot-candidate-alert.ts::scanHotCandidates) и шлёт HR алерт
// (in-app + Telegram канал компании) для тех, у кого высокий балл Портрета
// и per-vacancy фича включена (spec.hotCandidateAlert.enabled, дефолт ВЫКЛ).
//
// Cooldown 30 минут — тот же паттерн, что ai-chatbot-watcher: не смысла
// гонять сканирование чаще, алерт всё равно "протух за N часов", а не за минуту.
//
// Расписание (раз в 30 минут):
//   */30 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/hot-candidate-alerts \
//     >> /var/log/hot-candidate-alerts.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { desc, and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { scanHotCandidates } from "@/lib/demo/hot-candidate-alert"

const CRON_NAME = "hot-candidate-alerts"
const MIN_INTERVAL_MS = 30 * 60_000 // 30 минут

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
  if (lastOk && Date.now() - lastOk.getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "too_recent",
      lastOk: lastOk.toISOString(),
    })
  }

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const result = await scanHotCandidates()
    if (run) await finishCronRun(run.id, "ok", { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[cron/hot-candidate-alerts]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
