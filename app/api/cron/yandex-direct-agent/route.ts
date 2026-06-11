// Cron AI-агента Яндекс.Директа: для каждой компании с активной интеграцией —
// синк кампаний/статистики + анализ оптимизатором (автопилот применяет
// безопасные действия сам, иначе — рекомендации в ленту агента).
//
// Расписание на сервере (раз в 6 часов, утро/день/вечер/ночь МСК):
//   0 3,9,15,21 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/yandex-direct-agent >> /var/log/yandex-direct-agent.log 2>&1
//
// Cooldown 4 часа — защита от дублей при ручных запусках.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { listCompaniesWithIntegration, runOptimizer } from "@/lib/yandex-direct/agent"

const CRON_NAME = "yandex-direct-agent"
const MIN_INTERVAL_MS = 4 * 60 * 60_000

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: cronRuns.startedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.startedAt ?? null
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const lastOk = await lastSuccessfulRunAt()
  if (lastOk && Date.now() - lastOk.getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, skipped: true, reason: "too_recent" })
  }

  const companies = await listCompaniesWithIntegration()
  if (companies.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_integrations" })
  }

  const run = await startCronRun(CRON_NAME)
  try {
    const results: Array<{ companyId: string; recommendations?: number; autoApplied?: number; error?: string }> = []
    for (const companyId of companies) {
      try {
        const r = await runOptimizer(companyId)
        results.push({ companyId, recommendations: r.recommendations, autoApplied: r.autoApplied })
      } catch (err) {
        // Одна сломанная интеграция не должна останавливать обход остальных
        console.error(`[${CRON_NAME}] company ${companyId}:`, err)
        results.push({ companyId, error: String(err).slice(0, 300) })
      }
    }

    await finishCronRun(run.id, "ok", {
      companiesProcessed: companies.length,
      totalRecommendations: results.reduce((a, r) => a + (r.recommendations ?? 0), 0),
      totalAutoApplied: results.reduce((a, r) => a + (r.autoApplied ?? 0), 0),
      errors: results.filter(r => r.error).length,
    })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    await finishCronRun(run.id, "error", null, String(err))
    throw err
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
