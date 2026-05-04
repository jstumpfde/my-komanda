// POST /api/cron/hh-incoming-messages
// Каждые 15 минут: тянет новые applicant-сообщения из hh-чата для до
// 100 откликов (FIFO по last_check_at NULLS FIRST), прогоняет через
// двухступенчатый классификатор (regex STOP_WORDS → AI fallback) и
// применяет действия (rejected / wants_contact / log).
//
// Защищён X-Cron-Secret. Подключён в crontab прода через */15 * * * *.

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { scanIncomingMessages } from "@/lib/hh/scan-incoming"

const LIMIT_PER_RUN = 100
const STALE_MINUTES = 14

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  try {
    const result = await scanIncomingMessages({
      limit:        LIMIT_PER_RUN,
      staleMinutes: STALE_MINUTES,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cron/hh-incoming-messages]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
