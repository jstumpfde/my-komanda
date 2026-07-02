import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { exchangeCode, getMe } from "@/lib/hh-api"
import { verifyHhState } from "@/lib/hh/oauth-state"
// База редиректа — из env (НЕ req.url): Next 16 подставляет внутренний origin
// (http://localhost:3000) — инцидент 02.07.
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/hr/hiring-settings?tab=integrations&error=missing_params", getAppBaseUrl()))
  }

  // State подписан HMAC при инициации (/connect). Проверяем подпись — без неё
  // companyId из state доверять НЕЛЬЗЯ (иначе можно привязать hh-интеграцию к
  // чужой компании, подставив чужой companyId).
  const parsed = verifyHhState(state)
  if (!parsed) {
    return NextResponse.redirect(new URL("/hr/hiring-settings?tab=integrations&error=invalid_state", getAppBaseUrl()))
  }
  const companyId: string = parsed.companyId
  const userId: string = parsed.userId
  const vacancyId: string | undefined = parsed.vacancyId

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    const me = await getMe(tokens.access_token)
    const employerId = me.employer?.id ?? me.id
    const employerName = me.employer?.name ?? null

    const existing = await db
      .select({ id: hhIntegrations.id })
      .from(hhIntegrations)
      .where(eq(hhIntegrations.companyId, companyId))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(hhIntegrations)
        .set({
          employerId,
          employerName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          connectedBy: userId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(hhIntegrations.companyId, companyId))
    } else {
      await db
        .insert(hhIntegrations)
        .values({
          companyId,
          employerId,
          employerName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          connectedBy: userId,
          isActive: true,
        })
    }

    // Подключались со страницы вакансии — возвращаемся туда и сразу
    // открываем «Привязать» (флаг hhConnected=1), чтобы шаг был один.
    if (vacancyId) {
      return NextResponse.redirect(new URL(`/hr/vacancies/${vacancyId}?hhConnected=1`, getAppBaseUrl()))
    }
    return NextResponse.redirect(new URL("/hr/hiring-settings?tab=integrations&connected=hh", getAppBaseUrl()))
  } catch (err) {
    console.error("[hh/callback]", err)
    return NextResponse.redirect(new URL("/hr/hiring-settings?tab=integrations&error=auth_failed", getAppBaseUrl()))
  }
}
