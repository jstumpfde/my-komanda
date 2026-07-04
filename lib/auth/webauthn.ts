// WebAuthn/passkey — общие хелперы: разрешение RP (домен), подписанная
// challenge-кука и одноразовый токен для передачи проверенной passkey-аутентификации
// в NextAuth Credentials-провайдер. Подпись — HMAC-SHA256 на NEXTAUTH_SECRET.
import { createHmac, timingSafeEqual } from "crypto"

const SECRET = process.env.NEXTAUTH_SECRET || "dev-secret-change-me"

export const CHALLENGE_COOKIE = "wa_challenge"
const CHALLENGE_TTL_MS = 5 * 60 * 1000   // 5 минут на завершение церемонии
const PASSKEY_TOKEN_TTL_MS = 60 * 1000   // 60 сек: verify → signIn

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Кодирует бинарный публичный ключ passkey в base64url для хранения в БД. */
export function bufToB64url(buf: Uint8Array): string {
  return b64url(Buffer.from(buf))
}

/** Обратно из base64url в Uint8Array (публичный ключ при верификации). */
export function b64urlToBuf(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  // Свежий ArrayBuffer-backed Uint8Array — совместим с типами @simplewebauthn.
  const out = new Uint8Array(b.byteLength)
  out.set(b)
  return out
}

/** Кодирует строку в ArrayBuffer-backed Uint8Array (для userID при регистрации). */
export function strToBuf(s: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder().encode(s)
  const out = new Uint8Array(enc.byteLength)
  out.set(enc)
  return out
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", SECRET).update(payloadB64).digest())
}

/** Подписывает произвольный JSON-объект → "payload.signature" (base64url). */
function seal(obj: Record<string, unknown>): string {
  const payload = b64url(Buffer.from(JSON.stringify(obj)))
  return `${payload}.${sign(payload)}`
}

/** Проверяет подпись и возвращает объект, либо null (подделка/битый формат). */
function unseal(value: string | undefined | null): Record<string, unknown> | null {
  if (!value) return null
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) as Record<string, unknown>
  } catch {
    return null
  }
}

// ── Разрешение RP (Relying Party) из входящего запроса ────────────────────────
// rpID = регистрируемый домен (host без порта). origin = scheme://host[:port].
// Passkey привязан к rpID: ключ с company24.pro не сработает на другом домене.
export function resolveRp(req: { headers: { get(name: string): string | null } }): {
  rpID: string
  rpName: string
  origin: string
} {
  const forwardedHost = req.headers.get("x-forwarded-host")
  const host = (forwardedHost || req.headers.get("host") || "company24.pro").split(",")[0].trim()
  const hostname = host.split(":")[0]
  const proto = (req.headers.get("x-forwarded-proto") || (hostname === "localhost" ? "http" : "https")).split(",")[0].trim()
  return { rpID: hostname, rpName: "Company24", origin: `${proto}://${host}` }
}

// ── Challenge-кука ────────────────────────────────────────────────────────────
export function sealChallenge(challenge: string, type: "reg" | "auth", userId?: string): string {
  return seal({ challenge, type, userId: userId ?? null, exp: Date.now() + CHALLENGE_TTL_MS })
}

export function openChallenge(cookieValue: string | undefined, type: "reg" | "auth"): { challenge: string; userId: string | null } | null {
  const obj = unseal(cookieValue)
  if (!obj) return null
  if (obj.type !== type) return null
  if (typeof obj.exp !== "number" || obj.exp < Date.now()) return null
  if (typeof obj.challenge !== "string") return null
  return { challenge: obj.challenge, userId: (obj.userId as string | null) ?? null }
}

// ── Одноразовый токен «passkey проверен» для signIn("passkey") ────────────────
export function sealPasskeyToken(userId: string): string {
  return seal({ userId, exp: Date.now() + PASSKEY_TOKEN_TTL_MS })
}

export function openPasskeyToken(token: string | undefined | null): { userId: string } | null {
  const obj = unseal(token)
  if (!obj) return null
  if (typeof obj.exp !== "number" || obj.exp < Date.now()) return null
  if (typeof obj.userId !== "string" || !obj.userId) return null
  return { userId: obj.userId }
}
