// GET /api/public/tip/me/ref — реферальный код и готовая ссылка «Подари
// разбор» текущего анонимного пользователя (cookie tip_uid). Код создаётся
// лениво при первом обращении (ensureRefCode).

import { NextRequest, NextResponse } from "next/server"
import { getOrCreateTipUser } from "@/lib/tip/session"
import { ensureRefCode } from "@/lib/tip/referral"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

export const runtime = "nodejs"

export async function GET(_req: NextRequest) {
  const user = await getOrCreateTipUser()
  const refCode = await ensureRefCode(user.id)

  return NextResponse.json({
    refCode,
    url: `${getAppBaseUrl()}/tip?ref=${refCode}`,
  })
}
