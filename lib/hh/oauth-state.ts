// Подписанный OAuth-state для hh.ru. Формат: `base64url(json).hmac`,
// HMAC-SHA256 через NEXTAUTH_SECRET. Без секрета state подделать нельзя —
// callback доверяет companyId только после проверки подписи.
//
// Зачем: раньше callback читал companyId из НЕподписанного base64-state и
// привязывал hh-интеграцию к этой компании. Директор компании A мог подставить
// companyId компании B в state и привязать свой hh-аккаунт к чужой компании.

import { createHmac, timingSafeEqual } from "crypto"

export interface HhOAuthState {
  companyId: string
  userId: string
  vacancyId?: string
  // Метка выпуска — на будущее (можно отбраковывать протухшие state).
  issuedAt: number
}

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET не задан — hh OAuth state невозможно подписать")
  return s
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url")
}

// Кодирует state в `base64url(json).hmac`.
export function encodeHhState(payload: HhOAuthState): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${payloadB64}.${sign(payloadB64)}`
}

// Проверяет подпись и парсит payload. Любая осечка → null (fail-safe).
export function verifyHhState(raw: string | undefined | null): HhOAuthState | null {
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
  try {
    if (!timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const obj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<HhOAuthState>
    if (typeof obj.companyId === "string" && typeof obj.userId === "string") {
      return {
        companyId: obj.companyId,
        userId: obj.userId,
        vacancyId: typeof obj.vacancyId === "string" ? obj.vacancyId : undefined,
        issuedAt: typeof obj.issuedAt === "number" ? obj.issuedAt : 0,
      }
    }
  } catch {
    return null
  }
  return null
}
