import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"

// ─── HMAC token helpers (shared between /auth and /context) ───────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function getSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || null
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export function signToken(payload: object): string | null {
  const secret = getSecret()
  if (!secret) return null
  const json = JSON.stringify(payload)
  const body = base64url(Buffer.from(json))
  const sig = base64url(createHmac("sha256", secret).update(body).digest())
  return `${body}.${sig}`
}

export function verifyToken(token: string): { companyId?: string; exp?: number } | null {
  const secret = getSecret()
  if (!secret) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = base64url(createHmac("sha256", secret).update(body).digest())
  if (expected !== sig) return null
  try {
    const paddedBody = body.replace(/-/g, "+").replace(/_/g, "/")
    const json = Buffer.from(paddedBody, "base64").toString()
    const payload = JSON.parse(json) as { companyId?: string; exp?: number }
    if (typeof payload.exp === "number" && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// ─── POST: validate code + password, issue a short-lived token ────────────

export async function POST(req: NextRequest) {
  let body: { code?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const code = (body.code || "").trim()
  const password = (body.password || "").trim()

  if (!code || !password) {
    return NextResponse.json({ error: "Укажите код и пароль" }, { status: 400 })
  }

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      joinCode: companies.joinCode,
    })
    .from(companies)
    .where(eq(companies.joinCode, code))
    .limit(1)

  if (!company || !company.joinCode) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })
  }

  // MVP: password == join_code. Replace with a dedicated column once ready.
  if (password !== company.joinCode) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 })
  }

  const token = signToken({ companyId: company.id, exp: Date.now() + TOKEN_TTL_MS })
  if (!token) {
    console.error("[public/knowledge-chat/auth] NEXTAUTH_SECRET missing")
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 500 })
  }

  return NextResponse.json({
    token,
    companyId: company.id,
    companyName: company.name,
  })
}
