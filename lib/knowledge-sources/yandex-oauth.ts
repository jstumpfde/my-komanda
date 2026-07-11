// OAuth Яндекс.Диска для «Подключённых источников» базы знаний (по образцу
// lib/yandex-direct/oauth.ts — тот же oauth.yandex.ru, другой scope и env).
// Приложение регистрируется на oauth.yandex.ru с правом «Яндекс.Диск REST
// API» — scope cloud_api:disk.read (read-only: мы никогда не пишем на диск
// клиента, см. концепт kb-connected-sources §concept «Чего сознательно НЕ
// делаем»).

const OAUTH_BASE = "https://oauth.yandex.ru"

export interface YandexDiskTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
}

function credentials() {
  const clientId = process.env.YANDEX_DISK_CLIENT_ID
  const clientSecret = process.env.YANDEX_DISK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("Яндекс.Диск не настроен на сервере (нет YANDEX_DISK_CLIENT_ID/SECRET)")
  }
  return { clientId, clientSecret }
}

export function isYandexDiskConfigured(): boolean {
  return Boolean(process.env.YANDEX_DISK_CLIENT_ID && process.env.YANDEX_DISK_CLIENT_SECRET)
}

export function buildAuthUrl(state: string): string {
  const { clientId } = credentials()
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    state,
  })
  const redirectUri = process.env.YANDEX_DISK_REDIRECT_URI
  if (redirectUri) params.set("redirect_uri", redirectUri)
  return `${OAUTH_BASE}/authorize?${params.toString()}`
}

async function tokenRequest(body: URLSearchParams): Promise<YandexDiskTokens> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Yandex OAuth error ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

export async function exchangeCode(code: string): Promise<YandexDiskTokens> {
  const { clientId, clientSecret } = credentials()
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
  }))
}

export async function refreshTokens(refreshToken: string): Promise<YandexDiskTokens> {
  const { clientId, clientSecret } = credentials()
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }))
}

// Логин аккаунта — чтобы показать в UI, чей диск подключён.
export async function getYandexLogin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://login.yandex.ru/info?format=json", {
      headers: { Authorization: `OAuth ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.login ?? null
  } catch {
    return null
  }
}
