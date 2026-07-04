// POST /api/auth/passkey/auth/verify — проверка входа по passkey (публичный).
// При успехе возвращает ОДНОРАЗОВЫЙ подписанный токен, который клиент передаёт
// в signIn("passkey") — саму сессию создаёт NextAuth. Сам ключ здесь не создаёт
// сессию, только подтверждает личность.
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import { db } from "@/lib/db"
import { webauthnCredentials, users } from "@/lib/db/schema"
import { resolveRp, openChallenge, b64urlToBuf, sealPasskeyToken, CHALLENGE_COOKIE } from "@/lib/auth/webauthn"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null
  if (!body?.response?.id) return NextResponse.json({ error: "Нет данных" }, { status: 400 })

  const challenge = openChallenge(req.cookies.get(CHALLENGE_COOKIE)?.value, "auth")
  if (!challenge) return NextResponse.json({ error: "Сессия входа истекла, попробуйте снова" }, { status: 400 })

  const [cred] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, body.response.id))
    .limit(1)

  if (!cred) return NextResponse.json({ error: "Ключ не найден" }, { status: 401 })

  const { rpID, origin } = resolveRp(req)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: cred.credentialId,
        publicKey: b64urlToBuf(cred.publicKey),
        counter: cred.counter,
        transports: (cred.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] | null) ?? undefined,
      },
    })
  } catch {
    return NextResponse.json({ error: "Не удалось проверить ключ" }, { status: 401 })
  }

  if (!verification.verified) return NextResponse.json({ error: "Ключ не подтверждён" }, { status: 401 })

  // Пользователь активен?
  const [user] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, cred.userId))
    .limit(1)
  if (!user || !user.isActive) return NextResponse.json({ error: "Аккаунт неактивен" }, { status: 403 })

  // Обновляем counter (защита от клонирования) и время последнего входа.
  await db.update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, cred.id))

  const res = NextResponse.json({ token: sealPasskeyToken(user.id) })
  res.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
