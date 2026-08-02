// Крон «Дайджест выбросов цен» (Бизнес-ассистент → Авиабилеты): раз в сутки
// обновляет ленту находок из Telegram-каналов (та же логика, что
// GET /api/modules/business-assistant/flights/deals — переиспользуем
// refreshFlightDealsIfStale, НЕ дублируем), отбирает топ дешёвых находок за
// последние 24 часа (lib/business-assistant/flights/deals-digest.ts) и
// рассылает HTML-сообщение всем привязанным Telegram-чатам
// (user_telegram_links, chat_id IS NOT NULL). Бот приносит пользу сам, без
// запроса пользователя.
//
// Если находок за сутки меньше DIGEST_MIN_FINDINGS — дайджест не шлём, не
// спамим пустотой.
//
// Расписание на сервере (раз в сутки, 09:00 МСК):
//   0 6 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/flight-deals-digest \
//     >> /var/log/flight-deals-digest.log 2>&1
//
// Cooldown 20 часов между запусками — защита от дублей при ручных
// перезапусках (крон раз в сутки, окно даёт запас на ретраи).
import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns, flightDeals, userTelegramLinks } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { refreshFlightDealsIfStale } from "@/lib/business-assistant/flights/deals-cache"
import { selectDigestDeals, buildDigestMessage } from "@/lib/business-assistant/flights/deals-digest"
import { tgSend } from "@/lib/telegram/tiket-bot"

const CRON_NAME = "flight-deals-digest"
const MIN_INTERVAL_MS = 20 * 60 * 60_000

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

  const run = await startCronRun(CRON_NAME)

  try {
    // Обновляем ленту тем же путём, что и ручной запрос ленты (force=true —
    // крон должен опросить каналы, а не полагаться на TTL-кэш).
    let refreshError: string | null = null
    try {
      await refreshFlightDealsIfStale(true)
    } catch (e) {
      refreshError = e instanceof Error ? e.message : "Не удалось обновить ленту"
    }

    const allDeals = await db.select().from(flightDeals).orderBy(desc(flightDeals.createdAt))
    const selection = selectDigestDeals(allDeals)

    if (!selection.shouldSend) {
      await finishCronRun(run.id, "ok", {
        refreshError,
        eligibleCount: selection.eligibleCount,
        sent: false,
        reason: "not_enough_findings",
      })
      return NextResponse.json({ ok: true, sent: false, eligibleCount: selection.eligibleCount })
    }

    const links = await db
      .select({ chatId: userTelegramLinks.chatId })
      .from(userTelegramLinks)
      .where(isNotNull(userTelegramLinks.chatId))

    const message = buildDigestMessage(selection.deals)

    let sent = 0
    let failed = 0
    for (const link of links) {
      if (!link.chatId) continue
      const ok = await tgSend(link.chatId, message)
      if (ok) sent++
      else failed++
    }

    await finishCronRun(run.id, "ok", {
      refreshError,
      eligibleCount: selection.eligibleCount,
      dealsInDigest: selection.deals.length,
      recipients: links.length,
      sent,
      failed,
    })
    return NextResponse.json({ ok: true, sent: true, dealsInDigest: selection.deals.length, recipients: links.length, delivered: sent, failed })
  } catch (err) {
    await finishCronRun(run.id, "error", null, String(err))
    throw err
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
