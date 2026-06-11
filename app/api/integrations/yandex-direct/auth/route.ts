// Старт OAuth Яндекса: redirect на oauth.yandex.ru, state = companyId+userId
// (по образцу app/api/integrations/hh/auth).

import { NextResponse } from "next/server"
import { requireDirector } from "@/lib/api-helpers"
import { buildAuthUrl } from "@/lib/yandex-direct/oauth"

export async function GET() {
  let user
  try {
    user = await requireDirector()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!process.env.YANDEX_DIRECT_CLIENT_ID || !process.env.YANDEX_DIRECT_CLIENT_SECRET) {
    return NextResponse.json({ error: "Яндекс.Директ не настроен на сервере" }, { status: 500 })
  }

  const state = Buffer.from(
    JSON.stringify({ companyId: user.companyId, userId: user.id }),
  ).toString("base64url")

  return NextResponse.redirect(buildAuthUrl(state))
}
