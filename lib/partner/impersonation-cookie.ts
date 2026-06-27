// Чистые крипто-хелперы для куки impersonation (БЕЗ next/headers и БЕЗ db) —
// чтобы middleware мог импортировать verifyAndDecodeActingAs, не затаскивая
// next/headers и драйвер БД в свой бандл.
//
// Формат куки mk_acting_as: `base64url(payload).hmac`, HMAC-SHA256 через
// NEXTAUTH_SECRET. Подделать payload без секрета нельзя.

import { createHmac, timingSafeEqual } from "crypto"

export const ACTING_AS_COOKIE = "mk_acting_as"

export interface ActingAsPayload {
  clientCompanyId: string
  integratorId: string
  realUserId: string
  issuedAt: number
  // "partner" (по умолчанию) — вход партнёра в клиента; "admin" — вход
  // платформ-админа в любую компанию (Юрий 27.06). Подписано HMAC.
  mode?: "partner" | "admin"
}

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET не задан — impersonation невозможна")
  return s
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url")
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url")
}

// Кодирует payload в формат `base64url(json).hmac`.
export function encodeActingAs(payload: ActingAsPayload): string {
  const payloadB64 = b64url(JSON.stringify(payload))
  return `${payloadB64}.${sign(payloadB64)}`
}

// Проверяет подпись и парсит payload. Любая осечка → null (fail-safe).
// БЕЗ обращения к БД и next/headers — пригодно для middleware (Node runtime).
export function verifyAndDecodeActingAs(raw: string | undefined | null): ActingAsPayload | null {
  if (!raw) return null
  const dot = raw.lastIndexOf(".")
  if (dot <= 0) return null
  const payloadB64 = raw.slice(0, dot)
  const providedSig = raw.slice(dot + 1)
  if (!payloadB64 || !providedSig) return null

  let expectedSig: string
  try {
    expectedSig = sign(payloadB64)
  } catch {
    return null
  }

  // Сравнение подписи в постоянное время.
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  let sigOk = false
  try {
    sigOk = timingSafeEqual(a, b)
  } catch {
    return null
  }
  if (!sigOk) return null

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8")
    const obj = JSON.parse(json) as Partial<ActingAsPayload>
    if (
      typeof obj.clientCompanyId === "string" &&
      typeof obj.integratorId === "string" &&
      typeof obj.realUserId === "string" &&
      typeof obj.issuedAt === "number"
    ) {
      return {
        clientCompanyId: obj.clientCompanyId,
        integratorId: obj.integratorId,
        realUserId: obj.realUserId,
        issuedAt: obj.issuedAt,
        mode: obj.mode === "admin" ? "admin" : "partner",
      }
    }
    return null
  } catch {
    return null
  }
}
