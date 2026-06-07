// P0-30: cron health-check endpoint.
// Читает cron_runs, сравнивает last-finished-ok-at для каждого критичного
// cron'а с ожидаемым интервалом. Если запуска не было > 2× интервал —
// формирует alert. Telegram-бот для уведомлений пока не подключён, так что
// alerts уходят в console.error. Сам endpoint возвращает JSON со списком
// проблем (200 если всё ок, 503 если есть просрочки) — чтобы внешний
// мониторинг (UptimeRobot/healthchecks.io) тоже мог понять статус.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "health-check"

interface CronSpec {
  name: string
  intervalMinutes: number
  label: string
}

// Критичные cron'ы, за которыми следим.
// intervalMinutes — ожидаемая частота из crontab/scheduler.
const CRITICAL_CRONS: CronSpec[] = [
  { name: "hh-import",             intervalMinutes: 5,  label: "Импорт откликов с hh.ru" },
  { name: "hh-incoming-messages",  intervalMinutes: 10, label: "Входящие сообщения hh" },
  { name: "follow-up",             intervalMinutes: 15, label: "Дожим кандидатов" },
  { name: "prequalification",      intervalMinutes: 15, label: "AI-предквалификация" },
]

interface CronStatus {
  name: string
  label: string
  intervalMinutes: number
  thresholdMinutes: number
  lastFinishedAt: string | null
  lastStatus: string | null
  staleMinutes: number | null
  stale: boolean
  errorMessage?: string | null
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const result = await runHealthCheck()
    if (run) await finishCronRun(run.id, "ok", null)
    return result
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    throw err
  }
}

// GET-вариант — чтобы UptimeRobot мог дёрнуть без секрета (только статус,
// без подробностей по cron'ам).
export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (auth.ok) {
    return runHealthCheck()
  }
  // Анонимный GET — облегчённый ответ для мониторинга.
  const { stale } = await collectStatus()
  return NextResponse.json({ ok: !stale }, { status: stale ? 503 : 200 })
}

async function collectStatus(): Promise<{ statuses: CronStatus[]; stale: boolean }> {
  const now = Date.now()
  const statuses: CronStatus[] = []

  for (const spec of CRITICAL_CRONS) {
    // Берём последний finished_at от запуска со status='ok'. Если такой нет —
    // последний finished_at вообще (может быть 'error'/'busy').
    const [lastOk] = await db
      .select({
        finishedAt:   cronRuns.finishedAt,
        status:       cronRuns.status,
        errorMessage: cronRuns.errorMessage,
      })
      .from(cronRuns)
      .where(and(eq(cronRuns.cronName, spec.name), eq(cronRuns.status, "ok")))
      .orderBy(desc(cronRuns.finishedAt))
      .limit(1)

    const [lastAny] = await db
      .select({
        finishedAt:   cronRuns.finishedAt,
        status:       cronRuns.status,
        errorMessage: cronRuns.errorMessage,
      })
      .from(cronRuns)
      .where(eq(cronRuns.cronName, spec.name))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1)

    const last = lastOk ?? lastAny
    const lastFinishedAt = last?.finishedAt ?? null
    const lastStatus = last?.status ?? null
    const staleMinutes = lastFinishedAt
      ? Math.floor((now - lastFinishedAt.getTime()) / 60000)
      : null
    const thresholdMinutes = spec.intervalMinutes * 2
    const stale = staleMinutes === null || staleMinutes > thresholdMinutes

    statuses.push({
      name: spec.name,
      label: spec.label,
      intervalMinutes: spec.intervalMinutes,
      thresholdMinutes,
      lastFinishedAt: lastFinishedAt ? lastFinishedAt.toISOString() : null,
      lastStatus,
      staleMinutes,
      stale,
      errorMessage: last?.errorMessage ?? null,
    })
  }

  const stale = statuses.some(s => s.stale)
  return { statuses, stale }
}

async function runHealthCheck(): Promise<NextResponse> {
  const { statuses, stale } = await collectStatus()
  const problems = statuses.filter(s => s.stale)

  if (problems.length > 0) {
    // TODO: подключить Telegram-бот (см. финальный отчёт P0-30).
    // Пока — пишем в stderr, чтобы PM2/journald поймали.
    const lines = problems.map(p =>
      `[CRON-HEALTH] STALE ${p.name} (${p.label}): last finished ${p.lastFinishedAt ?? "never"} ` +
      `(${p.staleMinutes === null ? "never" : `${p.staleMinutes} min ago`}, ` +
      `threshold ${p.thresholdMinutes} min, last status=${p.lastStatus ?? "none"})`,
    )
    console.error(lines.join("\n"))
  }

  return NextResponse.json(
    {
      ok: !stale,
      checkedAt: new Date().toISOString(),
      statuses,
      problems,
    },
    { status: stale ? 503 : 200 },
  )
}

// sql import is kept for future use (e.g. window functions) — no current usage.
void sql
