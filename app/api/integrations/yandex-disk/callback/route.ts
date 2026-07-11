// OAuth callback Яндекс.Диска: меняем code на токены, шифруем (token-crypto),
// сохраняем/обновляем knowledge_sources. По образцу
// app/api/integrations/yandex-direct/callback, но state — подписанный HMAC
// (lib/knowledge-sources/oauth-state.ts), а не голый base64 — токены диска
// шире по scope и чувствительнее.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { knowledgeSources } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { exchangeCode, getYandexLogin } from "@/lib/knowledge-sources/yandex-oauth"
import { encryptToken, isTokenCryptoConfigured } from "@/lib/knowledge-sources/token-crypto"
import { verifyKnowledgeSourceState, isStateFresh } from "@/lib/knowledge-sources/oauth-state"
import { isKnowledgeDriveSourcesEnabled } from "@/lib/knowledge-sources/feature-flag"
// База редиректа — из env (НЕ req.url): Next 16 подставляет внутренний origin
// (http://localhost:3000) — инцидент 02.07.
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

const PAGE = "/knowledge-v2/sources"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const stateRaw = searchParams.get("state")

  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL(`${PAGE}?error=missing_params`, getAppBaseUrl()))
  }

  const state = verifyKnowledgeSourceState(stateRaw)
  if (!state || !isStateFresh(state) || state.provider !== "yandex_disk") {
    return NextResponse.redirect(new URL(`${PAGE}?error=invalid_state`, getAppBaseUrl()))
  }

  // Подпись гарантирует, что companyId в state не подделан. Дополнительно
  // сверяем с текущей сессией — на случай, если пользователь успел
  // разлогиниться/перелогиниться другим аккаунтом за время OAuth-редиректа.
  const session = await auth()
  if (!session?.user?.companyId || session.user.companyId !== state.companyId) {
    return NextResponse.redirect(new URL(`${PAGE}?error=invalid_state`, getAppBaseUrl()))
  }

  // MAJOR-1 (ревью 11.07): гейт фиче-флага и на callback — auth-роут флаг уже
  // проверил, но state живёт 10 минут, за это время флаг могли выключить.
  const enabled = await isKnowledgeDriveSourcesEnabled(state.companyId, session.user.email)
  if (!enabled) {
    return NextResponse.redirect(new URL(`${PAGE}?error=feature_disabled`, getAppBaseUrl()))
  }

  if (!isTokenCryptoConfigured()) {
    return NextResponse.redirect(new URL(`${PAGE}?error=key_not_configured`, getAppBaseUrl()))
  }

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const yandexLogin = await getYandexLogin(tokens.access_token)
    const title = yandexLogin ? `Яндекс.Диск (${yandexLogin})` : "Яндекс.Диск"

    const accessTokenEnc = encryptToken(tokens.access_token)
    const refreshTokenEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null

    const existing = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, state.companyId),
        eq(knowledgeSources.provider, "yandex_disk"),
      ))
      .limit(1)

    if (existing.length > 0) {
      await db.update(knowledgeSources).set({
        title,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt: expiresAt,
        connectedBy: state.userId,
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(knowledgeSources.id, existing[0].id))
    } else {
      await db.insert(knowledgeSources).values({
        tenantId: state.companyId,
        provider: "yandex_disk",
        title,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt: expiresAt,
        connectedBy: state.userId,
        rootFolders: [],
        status: "active",
      })
    }

    return NextResponse.redirect(new URL(`${PAGE}?connected=1`, getAppBaseUrl()))
  } catch (err) {
    console.error("[yandex-disk/callback]", err)
    return NextResponse.redirect(new URL(`${PAGE}?error=auth_failed`, getAppBaseUrl()))
  }
}
