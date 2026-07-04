// POST /api/auth/passkey/register/options — начало регистрации нового passkey
// для ТЕКУЩЕГО (залогиненного) пользователя. Личность = сессия.
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { generateRegistrationOptions } from "@simplewebauthn/server"
import { db } from "@/lib/db"
import { webauthnCredentials } from "@/lib/db/schema"
import { requireAuth } from "@/lib/api-helpers"
import { resolveRp, sealChallenge, strToBuf, CHALLENGE_COOKIE } from "@/lib/auth/webauthn"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.id || !user.email) return NextResponse.json({ error: "Нет пользователя" }, { status: 400 })

  const { rpID, rpName } = resolveRp(req)

  const existing = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id))

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: strToBuf(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: (c.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  const res = NextResponse.json(options)
  res.cookies.set(CHALLENGE_COOKIE, sealChallenge(options.challenge, "reg", user.id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 300,
  })
  return res
}

// Тип транспортов из библиотеки (для маппинга excludeCredentials).
type AuthenticatorTransportFuture = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb"
