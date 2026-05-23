// #69 Cron endpoint для AI-наблюдателя.
// GET /api/cron/ai-chatbot-watcher
// Защищён X-Cron-Secret. Для каждой активной компании запускает
// runWatcherAudit; если найдены issues — внутри уже создаются notifications.
//
// Расписание: раз в час (см. CLAUDE.md → Watcher cron).
//
// Группа 34, задача 2:
//   - cooldown: skip если последний успешный запуск был < 30 минут назад
//   - activity guard: skip если за последний час было <50 сообщений в
//     ai_chatbot_messages (нет смысла гонять Sonnet впустую)
//   - запись в cron_runs через startCronRun/finishCronRun

import { NextRequest, NextResponse } from "next/server"
import { sql, desc, and, eq, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { runWatcherAudit, listActiveCompaniesWithChatbot } from "@/lib/ai/chatbot-watcher"

const CRON_NAME = "ai-chatbot-watcher"
const MIN_INTERVAL_MS = 30 * 60_000     // 30 минут
const MIN_HOURLY_MESSAGES = 50           // если меньше — пропускаем

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

async function recentMessageCount(): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS c
    FROM ai_chatbot_messages
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  `)) as unknown as Array<{ c: number }>
  return Number(rows?.[0]?.c ?? 0)
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Cooldown: если последний успешный запуск был недавно — пропускаем.
  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json({
      ok:      true,
      skipped: true,
      reason:  "too_recent",
      lastOk:  lastOk.toISOString(),
    })
  }

  // Activity guard: смысл прогона есть только если в последний час был
  // заметный объём AI-сообщений. Иначе Watcher жжёт Sonnet впустую.
  const hourly = await recentMessageCount()
  if (hourly < MIN_HOURLY_MESSAGES) {
    return NextResponse.json({
      ok:        true,
      skipped:   true,
      reason:    "not_enough_activity",
      hourly,
      threshold: MIN_HOURLY_MESSAGES,
    })
  }

  // Полноценный прогон с логированием в cron_runs.
  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const companies = await listActiveCompaniesWithChatbot()
    console.log(`[cron/ai-chatbot-watcher] start companies=${companies.length} hourly=${hourly}`)

    const results: Array<{ companyId: string; issues: number; sampleSize: number; summary: string }> = []
    for (const companyId of companies) {
      try {
        const r = await runWatcherAudit(companyId)
        results.push({
          companyId,
          issues:     r.issues.length,
          sampleSize: r.sampleSize,
          summary:    r.summary,
        })
      } catch (err) {
        console.warn(`[cron/ai-chatbot-watcher] company=${companyId} failed:`, err)
        results.push({ companyId, issues: 0, sampleSize: 0, summary: "error" })
      }
    }

    const totalIssues = results.reduce((a, r) => a + r.issues, 0)
    if (run) await finishCronRun(run.id, "ok", {
      companiesProcessed: companies.length,
      totalIssues,
      hourly,
    })
    return NextResponse.json({ ok: true, hourly, results })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    throw err
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Suppress unused-import warning (gt-helper зарезервирован для возможной
// последующей фильтрации по диапазону дат).
void gt
