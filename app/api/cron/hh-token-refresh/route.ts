// POST /api/cron/hh-token-refresh — проактивное продление hh-токенов.
//
// Зачем: getValidToken продлевает токен только когда что-то его дёргает (лениво,
// за 5 мин до истечения). Если компания неактивна (нет вакансий/крон не ходит) —
// токен никто не обновляет и он умирает (так отвалились COMPANY24.PRO/ЮГОРИЯ).
// Этот крон заранее (за 3 дня) обновляет токены ВСЕХ активных интеграций, чтобы
// живые компании не теряли связь с hh внезапно. Оживить уже мёртвый токен нельзя
// (нужен ручной OAuth) — но не дать живому умереть можно.
//
// При неудаче refresh — помечаем интеграцию неактивной и пишем WARN в лог
// (для мониторинга/алерта).
//
// Расписание на сервере (раз в сутки достаточно — буфер 3 дня):
//   0 5 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/hh-token-refresh >> /var/log/hh-token-refresh.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { refreshAccessToken } from "@/lib/hh-api"
import { checkCronAuth } from "@/lib/cron/auth"

const REFRESH_AHEAD_MS = 3 * 24 * 60 * 60 * 1000 // обновляем за 3 дня до истечения

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = Date.now()
  const threshold = new Date(now + REFRESH_AHEAD_MS)

  // Активные интеграции, токен которых истекает в ближайшие 3 дня.
  const rows = await db
    .select()
    .from(hhIntegrations)
    .where(and(eq(hhIntegrations.isActive, true), lt(hhIntegrations.tokenExpiresAt, threshold)))

  let refreshed = 0
  let failed = 0

  for (const integ of rows) {
    try {
      const tokens = await refreshAccessToken(integ.refreshToken)
      await db
        .update(hhIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(now + tokens.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(hhIntegrations.id, integ.id))
      refreshed++
    } catch (err) {
      // Refresh не удался — токен фактически потерян. Помечаем неактивной и
      // громко логируем (WARN), чтобы можно было заметить/заалертить и вовремя
      // переподключить hh, пока компания активна.
      await db
        .update(hhIntegrations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(hhIntegrations.id, integ.id))
      console.error(JSON.stringify({
        tag: "cron/hh-token-refresh",
        level: "WARN",
        msg: "hh refresh failed — integration deactivated, needs manual reconnect",
        companyId: integ.companyId,
        employer: integ.employerName,
        error: err instanceof Error ? err.message : String(err),
      }))
      failed++
    }
  }

  const summary = { tag: "cron/hh-token-refresh", checked: rows.length, refreshed, failed, ts: new Date(now).toISOString() }
  console.log(JSON.stringify(summary))
  return NextResponse.json({ ok: true, ...summary })
}
