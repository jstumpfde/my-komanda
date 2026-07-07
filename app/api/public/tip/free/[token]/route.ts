// POST /api/public/tip/free/[token] — активировать бесплатную ссылку
// (tip_promo_codes.is_free_link = true, token = code).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { claimFreeLink, TipServiceError } from "@/lib/tip/service"
import { checkTipPromoRateLimit, checkTipPromoIpRateLimit, TIP_RATE_LIMIT_MESSAGE } from "@/lib/tip/rate-limit"

export const runtime = "nodejs"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // IP-лимит ДО создания анонимного пользователя (guard-major 07.07).
  if (!checkTipPromoIpRateLimit(req)) {
    return NextResponse.json({ error: TIP_RATE_LIMIT_MESSAGE }, { status: 429 })
  }

  const user = await getOrCreateTipUser()

  if (!checkTipPromoRateLimit(user.id)) {
    return NextResponse.json({ error: TIP_RATE_LIMIT_MESSAGE }, { status: 429 })
  }

  try {
    const result = await claimFreeLink(user.id, token)
    return NextResponse.json({ balanceRuns: result.balanceRuns }, { status: 200 })
  } catch (e) {
    if (e instanceof TipServiceError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    // eslint-disable-next-line no-console
    console.error("[tip] POST /api/public/tip/free/[token]", e)
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 })
  }
}
