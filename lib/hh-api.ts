// ─── HeadHunter API Client ──────────────────────────────────────────────────
// OAuth + API calls for hh.ru integration

const HH_TOKEN_URL = "https://hh.ru/oauth/token"
const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24/1.0 (company24.pro)"

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env: ${key}`)
  return val
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

const DEFAULT_REDIRECT_URI = "https://company24.pro/api/integrations/hh/callback"

export function getAuthUrl(state?: string): string {
  const clientId = getEnv("HH_CLIENT_ID")
  const redirectUri = process.env.HH_REDIRECT_URI || DEFAULT_REDIRECT_URI
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  if (state) params.set("state", state)
  return `https://hh.ru/oauth/authorize?${params}`
}

export interface HHTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export async function exchangeCode(code: string): Promise<HHTokenResponse> {
  const res = await fetch(HH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getEnv("HH_CLIENT_ID"),
      client_secret: getEnv("HH_CLIENT_SECRET"),
      redirect_uri: process.env.HH_REDIRECT_URI || DEFAULT_REDIRECT_URI,
      code,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HH token exchange failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<HHTokenResponse> {
  const res = await fetch(HH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getEnv("HH_CLIENT_ID"),
      client_secret: getEnv("HH_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HH token refresh failed: ${res.status} ${text}`)
  }
  return res.json()
}

// ─── API Fetch helper ───────────────────────────────────────────────────────

async function hhFetch<T = unknown>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HH API ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

// ─── API Methods ────────────────────────────────────────────────────────────

export interface HHMe {
  id: string
  employer?: { id: string; name: string }
}

export async function getMe(accessToken: string): Promise<HHMe> {
  return hhFetch("/me", accessToken)
}

export interface HHVacancyItem {
  id: string
  name: string
  area?: { name: string }
  salary?: { from: number | null; to: number | null; currency: string }
  status?: { id: string }
  counters?: { responses: number }
  alternate_url?: string
}

export interface HHVacanciesResponse {
  items: HHVacancyItem[]
  found: number
  page: number
  pages: number
  per_page: number
}

export async function getEmployerVacancies(accessToken: string, employerId: string, page = 0): Promise<HHVacanciesResponse> {
  return hhFetch(`/employers/${employerId}/vacancies/active?page=${page}&per_page=50`, accessToken)
}

export async function getVacancy(accessToken: string, vacancyId: string): Promise<HHVacancyItem> {
  return hhFetch(`/vacancies/${vacancyId}`, accessToken)
}

export interface HHNegotiationItem {
  id: string
  state: { id: string; name: string }
  vacancy: { id: string; name: string }
  resume?: {
    title?: string
    alternate_url?: string
    first_name?: string
    last_name?: string
    middle_name?: string
  }
  created_at: string
  phone?: string
  email?: string
}

export interface HHNegotiationsResponse {
  items: HHNegotiationItem[]
  found: number
  page: number
  pages: number
}

export async function getNegotiations(accessToken: string, page = 0): Promise<HHNegotiationsResponse> {
  return hhFetch(`/negotiations?page=${page}&per_page=50`, accessToken)
}
