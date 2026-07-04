// POST /api/auth/passkey/register/verify — завершение регистрации passkey:
// проверяем ответ аутентификатора и сохраняем ключ пользователю.
import { NextRequest, NextResponse } from "next/server"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"
import { db } from "@/lib/db"
import { webauthnCredentials } from "@/lib/db/schema"
import { requireAuth } from "@/lib/api-helpers"
import { resolveRp, openChallenge, bufToB64url, CHALLENGE_COOKIE } from "@/lib/auth/webauthn"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.id) return NextResponse.json({ error: "Нет пользователя" }, { status: 400 })

  const body = await req.json().catch(() => null) as { response?: RegistrationResponseJSON; deviceName?: string } | null
  if (!body?.response) return NextResponse.json({ error: "Нет данных" }, { status: 400 })

  const challenge = openChallenge(req.cookies.get(CHALLENGE_COOKIE)?.value, "reg")
  if (!challenge || challenge.userId !== user.id) {
    return NextResponse.json({ error: "Сессия регистрации истекла, попробуйте снова" }, { status: 400 })
  }

  const { rpID, origin } = resolveRp(req)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch {
    return NextResponse.json({ error: "Не удалось проверить ключ" }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Ключ не подтверждён" }, { status: 400 })
  }

  const { credential } = verification.registrationInfo
  const deviceName = (typeof body.deviceName === "string" && body.deviceName.trim())
    ? body.deviceName.trim().slice(0, 60)
    : (req.headers.get("user-agent")?.slice(0, 60) || "Устройство")

  await db.insert(webauthnCredentials).values({
    userId: user.id,
    credentialId: credential.id,
    publicKey: bufToB64url(credential.publicKey),
    counter: credential.counter ?? 0,
    transports: credential.transports ?? null,
    deviceName,
  }).onConflictDoNothing()

  const res = NextResponse.json({ ok: true })
  res.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
