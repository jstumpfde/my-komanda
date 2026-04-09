import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { exchangeCode, getMe } from "@/lib/hh-api"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/hr/integrations?error=missing_params", req.url))
  }

  let companyId: string
  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString())
    companyId = parsed.companyId
    userId = parsed.userId
  } catch {
    return NextResponse.redirect(new URL("/hr/integrations?error=invalid_state", req.url))
  }

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

    return NextResponse.redirect(new URL("/hr/integrations?connected=hh", req.url))
  } catch (err) {
    console.error("[hh/callback]", err)
    return NextResponse.redirect(new URL("/hr/integrations?error=auth_failed", req.url))
  }
}
