// GET/POST /api/cron/ai-rop-retry
//
// Реанимация failed-звонков AI-РОП с retry-able ошибками (rate-limit/timeout/
// сетевые обрывы у Anthropic/OpenAI/STT-провайдера) — порт call-agent
// scripts/worker.ts::autoRetryFailedTick. Не трогает permanent-failed звонки
// (например ProviderQuotaError — квота/биллинг, текст ошибки НЕ содержит
// retry-able паттернов, см. lib/ai-rop/pipeline.ts/types.ts).
//
// Защищён X-Cron-Secret. Рекомендуемое расписание (раз в 30 минут):
//   */30 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ai-rop-retry \
//     >> /var/log/ai-rop-retry.log 2>&1
import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "ai-rop-retry"

// Держим 1:1 со списком в lib/ai-rop/pipeline.ts-совместимым воркером оригинала
// (call-agent scripts/worker.ts) — сеть/лимиты/квоты у AI и STT провайдеров.
const RETRYABLE_ERROR_PATTERNS = [
  "overloaded_error",
  "rate_limit",
  "529",
  "429",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "fetch failed",
  "socket hang up",
  "Connection error",
  "403",
  "Country, region",
  "territory not supported",
]

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)

  try {
    const threshold = new Date(Date.now() - 10 * 60_000)
    const errorConditions = RETRYABLE_ERROR_PATTERNS.map((p) => sql`${ropCalls.error} ILIKE ${"%" + p + "%"}`)

    const reset = await db
      .update(ropCalls)
      .set({ status: "pending", attempts: 0, error: null, updatedAt: new Date() })
      .where(
        and(
          eq(ropCalls.status, "failed"),
          isNotNull(ropCalls.error),
          or(...errorConditions),
          lt(ropCalls.updatedAt, threshold),
        ),
      )
      .returning({ id: ropCalls.id })

    const result = { reset: reset.length }
    if (run) await finishCronRun(run.id, "ok", result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/${CRON_NAME}]`, err)
    if (run) await finishCronRun(run.id, "error", null, message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
