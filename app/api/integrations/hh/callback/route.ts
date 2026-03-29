import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { hhTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?error=hh_auth_failed`
    )
  }

  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/login`
    )
  }

  const clientId = process.env.HH_CLIENT_ID
  const clientSecret = process.env.HH_CLIENT_SECRET
  const redirectUri = process.env.HH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?error=hh_not_configured`
    )
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://hh.ru/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      throw new Error(`HH token exchange failed: ${tokenRes.status}`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    const expiresAt = new Date(Date.now() + (expires_in ?? 1209600) * 1000)

    // Fetch employer info
    let hhEmployerId: string | null = null
    try {
      const meRes = await fetch("https://api.hh.ru/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      if (meRes.ok) {
        const me = await meRes.json()
        hhEmployerId = me.employer?.id ?? null
      }
    } catch {
      // non-fatal
    }

    // Upsert token
    await db
      .insert(hhTokens)
      .values({
        companyId: user.companyId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        hhEmployerId,
      })
      .onConflictDoUpdate({
        target: hhTokens.companyId,
        set: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
          hhEmployerId,
          updatedAt: new Date(),
        },
      })

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?connected=hh`
    )
  } catch (err) {
    console.error("[HH callback]", err)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?error=hh_token_failed`
    )
  }
}
