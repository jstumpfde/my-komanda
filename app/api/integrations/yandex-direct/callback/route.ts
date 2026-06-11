// OAuth callback Яндекса: меняем code на токены, сохраняем интеграцию
// (по образцу app/api/integrations/hh/callback).

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { yandexDirectIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { exchangeCode, getYandexLogin } from "@/lib/yandex-direct/oauth"

const PAGE = "/marketing/yandex-direct"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${PAGE}?error=missing_params`, req.url))
  }

  let companyId: string
  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString())
    companyId = parsed.companyId
    userId = parsed.userId
    if (!companyId || !userId) throw new Error("bad state")
  } catch {
    return NextResponse.redirect(new URL(`${PAGE}?error=invalid_state`, req.url))
  }

  // state не подписан — сверяем с сессией, чтобы нельзя было подменить
  // companyId и привязать свой Яндекс-аккаунт к чужой компании.
  const session = await auth()
  if (!session?.user?.companyId || session.user.companyId !== companyId) {
    return NextResponse.redirect(new URL(`${PAGE}?error=invalid_state`, req.url))
  }

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const yandexLogin = await getYandexLogin(tokens.access_token)

    const existing = await db
      .select({ id: yandexDirectIntegrations.id })
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, companyId))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(yandexDirectIntegrations)
        .set({
          yandexLogin,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          connectedBy: userId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(yandexDirectIntegrations.companyId, companyId))
    } else {
      await db.insert(yandexDirectIntegrations).values({
        companyId,
        yandexLogin,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        connectedBy: userId,
        isActive: true,
      })
    }

    return NextResponse.redirect(new URL(`${PAGE}?connected=1`, req.url))
  } catch (err) {
    console.error("[yandex-direct/callback]", err)
    return NextResponse.redirect(new URL(`${PAGE}?error=auth_failed`, req.url))
  }
}
