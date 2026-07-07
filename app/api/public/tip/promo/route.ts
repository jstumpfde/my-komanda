// POST /api/public/tip/promo — активировать промокод (пополняет balance_runs).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { activatePromo, TipServiceError } from "@/lib/tip/service"
import { checkTipPromoRateLimit, TIP_RATE_LIMIT_MESSAGE } from "@/lib/tip/rate-limit"

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

  const user = await getOrCreateTipUser()

  if (!checkTipPromoRateLimit(user.id)) {
    return NextResponse.json({ error: TIP_RATE_LIMIT_MESSAGE }, { status: 429 })
  }

  try {
    const result = await activatePromo(user.id, body.code)
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
