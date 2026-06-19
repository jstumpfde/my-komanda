// Клиент сервиса рассылки. Имя провайдера НЕ зашито в код — берётся из env
// OUTREACH_API_BASE (настраивает админ платформы). Без env провайдер «не настроен».
const BASE = (process.env.OUTREACH_API_BASE || "").replace(/\/+$/, "")

export interface ProviderResult { ok: boolean; status: number; error?: string }

export function providerConfigured(): boolean {
  return Boolean(BASE)
}

/** Проверка ключа клиента: дёргаем лёгкий GET у провайдера. */
export async function testConnection(apiKey: string): Promise<ProviderResult> {
  if (!BASE) return { ok: false, status: 0, error: "Сервис рассылки не настроен (нет OUTREACH_API_BASE)" }
  if (!apiKey) return { ok: false, status: 0, error: "Пустой ключ" }
  try {
    const res = await fetch(`${BASE}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) return { ok: true, status: res.status }
    return { ok: false, status: res.status, error: res.status === 401 ? "Неверный ключ" : `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message }
  }
}

/** Авторизованный fetch к провайдеру (для будущих кампаний/лидов). */
export async function providerFetch(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  if (!BASE) throw new Error("Сервис рассылки не настроен")
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  })
}
