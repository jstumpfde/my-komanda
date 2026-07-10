// OAuth Zoom, ПЕР-ПОЛЬЗОВАТЕЛЬСКИЙ (не per-company, в отличие от hh/Директа) —
// Юрий 10.07: «каждый менеджер имеет свой Зум», встречу создаёт от своего
// имени тот, кто ведёт интервью.
//
// Приложение регистрируется на marketplace.zoom.us → Develop → Build App →
// "General App" (User-managed, OAuth). Scopes: meeting:write:meeting,
// meeting:read:meeting, user:read:user (или их legacy-эквиваленты
// meeting:write / user:read, если аккаунт ещё на classic-скоупах).
// Redirect URI (прописать в настройках приложения на Zoom):
//   https://company24.pro/api/integrations/zoom/callback
// Env: ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI.

const OAUTH_BASE = "https://zoom.us/oauth"
const API_BASE = "https://api.zoom.us/v2"

export interface ZoomTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
}

function credentials() {
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Zoom не настроен на сервере (нет ZOOM_CLIENT_ID/SECRET)")
  return { clientId, clientSecret }
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = credentials()
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
}

export function buildAuthUrl(state: string): string {
  const { clientId } = credentials()
  const redirectUri = process.env.ZOOM_REDIRECT_URI
  if (!redirectUri) throw new Error("ZOOM_REDIRECT_URI не задан")
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_BASE}/authorize?${params.toString()}`
}

async function tokenRequest(body: URLSearchParams): Promise<ZoomTokens> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Zoom OAuth error ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

export async function exchangeCode(code: string): Promise<ZoomTokens> {
  const redirectUri = process.env.ZOOM_REDIRECT_URI
  if (!redirectUri) throw new Error("ZOOM_REDIRECT_URI не задан")
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }))
}

// ВАЖНО: Zoom РОТИРУЕТ refresh_token при каждом обновлении — новый обязательно
// сохранять поверх старого (старый становится невалиден после одного refresh).
export async function refreshTokens(refreshToken: string): Promise<ZoomTokens> {
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }))
}

export async function getZoomEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.email ?? null
  } catch {
    return null
  }
}

export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await fetch(`${OAUTH_BASE}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({ token: accessToken }),
    })
  } catch {
    // best-effort — отключение в БД всё равно произойдёт
  }
}
