// Подписанный OAuth-state для источников знаний (Яндекс.Диск и далее) — тот
// же паттерн, что lib/hh/oauth-state.ts: `base64url(json).hmac`, HMAC-SHA256
// через NEXTAUTH_SECRET. Сознательно НЕ паттерн lib/yandex-direct (там state
// не подписан, доверие идёт только через сверку с текущей сессией) — токены
// диска чувствительнее (scope шире, чем Директ), поэтому берём более строгий
// hh-паттерн: state нельзя подделать даже до сверки с сессией.

import { createHmac, timingSafeEqual } from "crypto"

export interface KnowledgeSourceOAuthState {
  companyId: string
  userId: string
  // 'yandex_disk' сейчас; задел на другие провайдеры той же OAuth-схемой.
  provider: string
  issuedAt: number
}

// Протухание state — 10 минут: OAuth redirect обычно занимает секунды,
// длинный TTL увеличивает окно для повторного использования старой ссылки.
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET не задан — OAuth state источников знаний невозможно подписать")
  return s
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url")
}

export function encodeKnowledgeSourceState(payload: Omit<KnowledgeSourceOAuthState, "issuedAt">): string {
  const full: KnowledgeSourceOAuthState = { ...payload, issuedAt: Date.now() }
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString("base64url")
  return `${payloadB64}.${sign(payloadB64)}`
}

// Проверяет подпись и парсит payload. Любая осечка → null (fail-safe).
export function verifyKnowledgeSourceState(raw: string | undefined | null): KnowledgeSourceOAuthState | null {
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

  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  try {
    if (!timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const obj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<KnowledgeSourceOAuthState>
    if (typeof obj.companyId === "string" && typeof obj.userId === "string" && typeof obj.provider === "string") {
      return {
        companyId: obj.companyId,
        userId: obj.userId,
        provider: obj.provider,
        issuedAt: typeof obj.issuedAt === "number" ? obj.issuedAt : 0,
      }
    }
  } catch {
    return null
  }
  return null
}

export function isStateFresh(state: KnowledgeSourceOAuthState): boolean {
  return Date.now() - state.issuedAt < OAUTH_STATE_TTL_MS
}
