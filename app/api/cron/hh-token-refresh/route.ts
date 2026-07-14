// POST /api/cron/hh-token-refresh — обновление hh-токенов у дормантных компаний.
//
// ВАЖНО про hh.ru: их OAuth НЕ разрешает обновлять токен заранее — на refresh
// не-истёкшего токена hh отвечает 400 invalid_grant "token not expired". Поэтому
// «продлевать за N дней вперёд» невозможно в принципе. Обновлять можно только
// токен, который УЖЕ истёк.
//
// Что делает этот крон: у активных, но дормантных компаний (их крон-обращения
// ничего не дёргают → ленивый getValidToken не срабатывает) обновляет уже
// истёкшие токены, чтобы поддержать refresh-цепочку. Для компаний, которые
// реально работают, токен и так лениво обновляется в getValidToken.
//
// БЕЗОПАСНОСТЬ: крон НИКОГДА не деактивирует интеграцию сам. Раньше любая
// неудача refresh выключала интеграцию — и это вырубило живой Орлинк (hh вернул
// "token not expired" на здоровом токене). Теперь при неудаче — только WARN в
// лог; решение о деактивации остаётся за ленивым getValidToken во время реального
// использования (battle-tested) и за человеком.
//
// Расписание (опционально, раз в сутки достаточно):
//   0 5 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/hh-token-refresh >> /var/log/hh-token-refresh.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { refreshAccessToken } from "@/lib/hh-api"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "hh-token-refresh"

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)

  try {
    const now = Date.now()

    // Только активные интеграции с УЖЕ истёкшим токеном — hh не даёт обновить
    // не-истёкший (400 "token not expired").
    const rows = await db
      .select()
      .from(hhIntegrations)
      .where(and(eq(hhIntegrations.isActive, true), lt(hhIntegrations.tokenExpiresAt, new Date(now))))

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
        // НЕ деактивируем — только логируем. Деактивация по факту реального
        // использования делается в getValidToken; здесь же мы могли наткнуться на
        // временный сбой hh, и выключать живую интеграцию недопустимо.
        const message = err instanceof Error ? err.message : String(err)
        console.error(JSON.stringify({
          tag: "cron/hh-token-refresh",
          level: "WARN",
          msg: "hh refresh failed (integration left active — no auto-deactivate)",
          companyId: integ.companyId,
          employer: integ.employerName,
          error: message,
        }))
        failed++
      }
    }

    const summary = { tag: "cron/hh-token-refresh", checked: rows.length, refreshed, failed, ts: new Date(now).toISOString() }
    console.log(JSON.stringify(summary))
    if (run) await finishCronRun(run.id, "ok", { checked: rows.length, refreshed, failed })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
