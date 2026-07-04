"use client"

// Клиентские церемонии passkey поверх @simplewebauthn/browser.
// registerPasskey — для залогиненного пользователя (настройки профиля).
// loginWithPasskey — на странице входа; возвращает одноразовый токен для
// signIn("passkey", { token }).
import { startRegistration, startAuthentication } from "@simplewebauthn/browser"

async function errText(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null
  return body?.error || fallback
}

export async function registerPasskey(deviceName?: string): Promise<void> {
  const optRes = await fetch("/api/auth/passkey/register/options", { method: "POST" })
  if (!optRes.ok) throw new Error(await errText(optRes, "Не удалось начать регистрацию ключа"))
  const options = await optRes.json()
  const response = await startRegistration({ optionsJSON: options })
  const verRes = await fetch("/api/auth/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, deviceName }),
  })
  if (!verRes.ok) throw new Error(await errText(verRes, "Ключ не сохранён"))
}

export async function loginWithPasskey(): Promise<string> {
  const optRes = await fetch("/api/auth/passkey/auth/options", { method: "POST" })
  if (!optRes.ok) throw new Error(await errText(optRes, "Не удалось начать вход по ключу"))
  const options = await optRes.json()
  const response = await startAuthentication({ optionsJSON: options })
  const verRes = await fetch("/api/auth/passkey/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  })
  if (!verRes.ok) throw new Error(await errText(verRes, "Вход по ключу не удался"))
  const { token } = await verRes.json() as { token: string }
  return token
}

/** Поддерживает ли браузер passkey/WebAuthn. */
export function passkeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential
}
