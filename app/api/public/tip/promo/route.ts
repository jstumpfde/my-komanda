// POST /api/public/tip/promo — активировать промокод (пополняет balance_runs).

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tipUsers } from "@/lib/db/schema"
import { getOrCreateTipUser, switchTipUserCookie } from "@/lib/tip/session"
import { activatePromo, TipServiceError } from "@/lib/tip/service"
import { checkTipPromoRateLimit, checkTipPromoIpRateLimit, TIP_RATE_LIMIT_MESSAGE } from "@/lib/tip/rate-limit"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 })
  }

  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Промокод не найден" }, { status: 400 })
  }

  // IP-лимит ДО создания анонимного пользователя: сброс cookie брутфорсу
  // не помогает (guard-major 07.07).
  if (!checkTipPromoIpRateLimit(req)) {
    return NextResponse.json({ error: TIP_RATE_LIMIT_MESSAGE }, { status: 429 })
  }

  const user = await getOrCreateTipUser()

  if (!checkTipPromoRateLimit(user.id)) {
    return NextResponse.json({ error: TIP_RATE_LIMIT_MESSAGE }, { status: 429 })
  }

  try {
    const result = await activatePromo(user.id, body.code)

    // Личный код-пропуск (0265): не начисление прогонов, а переключение
    // браузерной cookie на аккаунт владельца — см. lib/tip/session.ts::
    // switchTipUserCookie. Баланс в ответе — баланс владельца (не текущего
    // анонимного пользователя), чтобы UI сразу показал верную цифру.
    if (result.personal) {
      await switchTipUserCookie(result.ownerUserId)
      const [owner] = await db
        .select({ balanceRuns: tipUsers.balanceRuns })
        .from(tipUsers)
        .where(eq(tipUsers.id, result.ownerUserId))
        .limit(1)
      return NextResponse.json({ personal: true, balanceRuns: owner?.balanceRuns ?? 0 }, { status: 200 })
    }

    return NextResponse.json({ balanceRuns: result.balanceRuns, runsGranted: result.runsGranted }, { status: 200 })
  } catch (e) {
    if (e instanceof TipServiceError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    // eslint-disable-next-line no-console
    console.error("[tip] POST /api/public/tip/promo", e)
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}
