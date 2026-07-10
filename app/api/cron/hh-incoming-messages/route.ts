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

// Аудит 10.07: при LIMIT=30 и кроне */10 пропускная способность ~180/час —
// очередь из 4.4k откликов делала полный круг ~за сутки, входящее «стоп» от
// кандидата могло лежать непрочитанным до 24ч. Подняли LIMIT до 50 и крон до
// */5 (crontab) → ~600/час, полный круг ~1.5 часа. Наложение прогонов теперь
// безопасно: в scanIncomingMessages есть атомарный CAS-claim отклика. nginx
// proxy timeout 60с может оборвать HTTP-ответ длинного прогона — Node при
// этом ДОДЕЛЫВАЕТ работу (обрыв клиента не убивает обработчик), а клейм
// исключает дубли на следующем тике.
const LIMIT_PER_RUN = 50
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
