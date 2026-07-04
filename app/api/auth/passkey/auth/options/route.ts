// POST /api/auth/passkey/auth/options — начало входа по passkey (публичный).
// Usernameless: allowCredentials пуст, браузер сам показывает доступные ключи
// для этого домена.
import { NextRequest, NextResponse } from "next/server"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import { resolveRp, sealChallenge, CHALLENGE_COOKIE } from "@/lib/auth/webauthn"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { rpID } = resolveRp(req)

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
  })

  const res = NextResponse.json(options)
  res.cookies.set(CHALLENGE_COOKIE, sealChallenge(options.challenge, "auth"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 300,
  })
  return res
}
