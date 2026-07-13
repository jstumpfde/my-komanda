// POST /api/cron/avito-incoming-messages
// Резервный обработчик входящих Авито-сообщений.
//
// В норме каждое сообщение обрабатывается сразу в webhook-роуте
// (/api/webhooks/avito). Этот cron — страховка на случай:
//   - таймаута webhook-обработки (Авито ждёт 200 за ~5 сек)
//   - временной недоступности нашего сервера (Авито не гарантирует retry)
//   - очереди (несколько сообщений за короткое время)
//
// Реализация: опрашивает Авито API GET /messenger/v1/accounts/{userId}/chats
// за последние N минут и дообрабатывает непрочитанные сообщения.
//
// ⚠️ PENDING_CREDENTIALS: Авито API вернёт 401/403 пока credentials не введены.
//    Эндпоинт корректно обработает это как ошибку и вернёт { ok: true, skipped: true }.
//
// Защищён X-Cron-Secret. Расписание (рекомендуемое, раз в 15 мин):
//   */15 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/avito-incoming-messages \
//     >> /var/log/avito-incoming.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { db } from "@/lib/db"

const CRON_NAME = "avito-incoming-messages"
import { avitoIntegrations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getAvitoToken } from "@/lib/channels/avito"
import { avitoAdapter } from "@/lib/channels/avito"
import { scanAvitoIncomingMessages, type AvitoInboundMessage } from "@/lib/avito/scan-incoming"

const AVITO_API_BASE = process.env.AVITO_API_BASE || "https://api.avito.ru"

// Сколько минут назад смотреть непрочитанные чаты.
const LOOKBACK_MINUTES = 20

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)

  try {
    // Берём все активные Авито-интеграции.
    const integrations = await db
      .select({
        companyId: avitoIntegrations.companyId,
        userId:    avitoIntegrations.userId,
      })
      .from(avitoIntegrations)
      .where(and(
        eq(avitoIntegrations.isEnabled, true),
        eq(avitoIntegrations.isActive, true),
      ))

    if (integrations.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_active_integrations" })
    }

    const totalResult = {
      integrations: integrations.length,
      processed:     0,
      newCandidates: 0,
      rejectedRegex: 0,
      rejectedAi:    0,
      wantsContact:  0,
      pausedNeedsReview: 0,
      errors:        [] as string[],
    }

    for (const integration of integrations) {
      if (!integration.userId) {
        totalResult.errors.push(`no_user_id:${integration.companyId}`)
        continue
      }

      // Получаем / обновляем токен.
      const accessToken = await getAvitoToken(integration.companyId)
      if (!accessToken) {
        totalResult.errors.push(`no_token:${integration.companyId}`)
        continue
      }

      // Запрашиваем чаты с непрочитанными сообщениями за LOOKBACK_MINUTES.
      const sinceTs = Math.floor((Date.now() - LOOKBACK_MINUTES * 60 * 1000) / 1000)
      let chatsData: unknown
      try {
        const res = await fetch(
          `${AVITO_API_BASE}/messenger/v1/accounts/${integration.userId}/chats?unread_only=true&updated_since=${sinceTs}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          totalResult.errors.push(`chats_api:${integration.companyId}:${res.status}:${body.slice(0, 100)}`)
          continue
        }
        chatsData = await res.json()
      } catch (err) {
        totalResult.errors.push(`chats_fetch:${integration.companyId}:${err instanceof Error ? err.message : "?"}`)
        continue
      }

      // Для каждого чата — тянем последние сообщения.
      const chats = (chatsData as { chats?: Array<{ id: string }> })?.chats ?? []
      const messages: AvitoInboundMessage[] = []

      for (const chat of chats) {
        try {
          const msgsRes = await fetch(
            `${AVITO_API_BASE}/messenger/v1/accounts/${integration.userId}/chats/${chat.id}/messages?limit=20`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          if (!msgsRes.ok) continue
          const msgsData = await msgsRes.json() as unknown

          // Преобразуем в формат InboundMessage через тот же адаптер parseInbound.
          // Оборачиваем в webhook-shaped payload (type="message").
          const rawMsgs = (msgsData as { messages?: unknown[] })?.messages ?? []
          for (const rawMsg of rawMsgs) {
            const parsed = avitoAdapter.parseInbound({
              type: "message",
              payload: {
                value: {
                  user_id:   Number(integration.userId),
                  chat_id:   chat.id,
                  ...(rawMsg as Record<string, unknown>),
                },
              },
            })
            messages.push(...parsed)
          }
        } catch (err) {
          totalResult.errors.push(`msgs_fetch:${chat.id}:${err instanceof Error ? err.message : "?"}`)
        }
      }

      if (messages.length > 0) {
        const r = await scanAvitoIncomingMessages(messages)
        totalResult.processed     += r.processed
        totalResult.newCandidates += r.newCandidates
        totalResult.rejectedRegex += r.rejectedRegex
        totalResult.rejectedAi    += r.rejectedAi
        totalResult.wantsContact  += r.wantsContact
        totalResult.pausedNeedsReview += r.pausedNeedsReview
        totalResult.errors.push(...r.errors)
      }
    }

    if (run) await finishCronRun(run.id, "ok", { integrations: totalResult.integrations, processed: totalResult.processed })
    return NextResponse.json({ ok: true, ...totalResult })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cron/avito-incoming-messages]", msg)
    if (run) await finishCronRun(run.id, "error", null, msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
