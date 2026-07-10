// Старт OAuth Zoom для ТЕКУЩЕГО пользователя (не компании — у каждого
// менеджера свой Zoom, Юрий 10.07). По образцу integrations/yandex-direct/auth.

import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { buildAuthUrl } from "@/lib/zoom/oauth"

export async function GET() {
  let user
  try {
    user = await requireAuth()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    return NextResponse.json({ error: "Zoom не настроен на сервере" }, { status: 500 })
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url")
  return NextResponse.redirect(buildAuthUrl(state))
}
