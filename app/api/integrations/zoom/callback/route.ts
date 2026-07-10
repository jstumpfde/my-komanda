// OAuth callback Zoom: меняем code на токены, сохраняем ЗА ТЕКУЩИМ пользователем
// (не компанией). По образцу integrations/yandex-direct/callback.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userVideoIntegrations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { exchangeCode, getZoomEmail } from "@/lib/zoom/oauth"
// База редиректа — из env (НЕ req.url): Next 16 подставляет внутренний origin
// (http://localhost:3000) — инцидент 02.07.
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

const PAGE = "/settings/profile"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${PAGE}?zoomError=missing_params`, getAppBaseUrl()))
  }

  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString())
    userId = parsed.userId
    if (!userId) throw new Error("bad state")
  } catch {
    return NextResponse.redirect(new URL(`${PAGE}?zoomError=invalid_state`, getAppBaseUrl()))
  }

  // state не подписан — сверяем с сессией, чтобы нельзя было привязать
  // чужой Zoom-аккаунт к чужому userId.
  const session = await auth()
  if (!session?.user?.id || session.user.id !== userId) {
    return NextResponse.redirect(new URL(`${PAGE}?zoomError=invalid_state`, getAppBaseUrl()))
  }

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const email = await getZoomEmail(tokens.access_token)

    const existing = await db
      .select({ id: userVideoIntegrations.id })
      .from(userVideoIntegrations)
      .where(and(eq(userVideoIntegrations.userId, userId), eq(userVideoIntegrations.provider, "zoom")))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(userVideoIntegrations)
        .set({
          externalAccountEmail: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(and(eq(userVideoIntegrations.userId, userId), eq(userVideoIntegrations.provider, "zoom")))
    } else {
      await db.insert(userVideoIntegrations).values({
        userId,
        provider: "zoom",
        externalAccountEmail: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        isActive: true,
      })
    }

    return NextResponse.redirect(new URL(`${PAGE}?zoomConnected=1`, getAppBaseUrl()))
  } catch (err) {
    console.error("[zoom/callback]", err)
    return NextResponse.redirect(new URL(`${PAGE}?zoomError=auth_failed`, getAppBaseUrl()))
  }
}
