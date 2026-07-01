// ─── HeadHunter API Client ──────────────────────────────────────────────────
// OAuth + API calls for hh.ru integration

import { guardOutgoingMessage } from "@/lib/messaging/outgoing-guard"
import { maybeAlertGuardIssue } from "@/lib/messaging/guard-alert"
import { maybeHoldMessage } from "@/lib/messaging/message-hold"

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

// Таймаут на один hh-вызов. Без него fetch без AbortSignal может зависнуть
// неограниченно: один «подвисший» negotiation-запрос (getNegotiationMessages
// и т.п.) внутри последовательного цикла processHhQueue держал бы весь прогон
// крона и единый advisory-lock, а следующий минутный cron возвращал бы 409 busy
// → свежие отклики не разбираются. 20с с запасом покрывают здоровые ответы hh
// (обычно <2с), но не дают одному битому вызову повесить прогон. На таймаут
// бросаем ошибку — вызывающий код (legacy-ветка ловит getNegotiationMessages
// в try/catch) деградирует штатно.
const HH_FETCH_TIMEOUT_MS = 20_000

async function hhFetch<T = unknown>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HH_API_BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(HH_FETCH_TIMEOUT_MS),
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
  // Детальный объект /vacancies/{id} отдаёт ещё archived/type — авторитетный
  // признак архива (в отличие от /vacancies/active, который для части
  // работодателей возвращает пустой список).
  archived?: boolean
  type?: { id: string; name: string }
  // Даты публикации из детали /vacancies/{id}. initial_created_at — дата ПЕРВОЙ
  // публикации (не меняется при переподнятии), published_at — последнего
  // поднятия, created_at — создания. Для счётчика «сколько дней висит на hh»
  // берём initial_created_at (fallback published_at → created_at).
  initial_created_at?: string
  published_at?: string
  created_at?: string
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

// Счётчики воронки hh по вакансии (collections.counters.total) — ТОЧНЫЕ числа
// из интерфейса hh. В отличие от /negotiations/{state} items (отдаёт неполно:
// скрытые/анонимные резюме), counters совпадают с UD hh.
export async function getNegotiationCounters(
  accessToken: string,
  vacancyId: string,
): Promise<Record<string, number>> {
  const d = await hhFetch<{ collections?: Array<{ id: string; counters?: { total?: number } }> }>(
    `/negotiations?vacancy_id=${vacancyId}`,
    accessToken,
  )
  const out: Record<string, number> = {}
  for (const c of d.collections ?? []) {
    if (c?.id) out[c.id] = c.counters?.total ?? 0
  }
  return out
}

export interface HHNegotiationItem {
  id: string
  state: { id: string; name: string }
  vacancy: { id: string; name: string }
  resume?: {
    id?: string
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

// Один раз за процесс логируем структуру ответа hh /negotiations — для диагностики
// в проде (видели "r.items is not iterable"). В лог попадает только первый успешный
// ответ, чтобы не засорять журнал.
let _negotiationsShapeLogged = false

export async function getNegotiations(
  accessToken: string,
  opts: { vacancyId: string; page?: number },
): Promise<HHNegotiationsResponse> {
  // hh API: список откликов на вакансию — GET /negotiations/response?vacancy_id=…
  // Возвращает { items, found, pages, page, per_page } с резюме кандидатов.
  const sp = new URLSearchParams()
  sp.set("vacancy_id", opts.vacancyId)
  sp.set("page", String(opts.page ?? 0))
  sp.set("per_page", "50")
  const response = await hhFetch<unknown>(`/negotiations/response?${sp.toString()}`, accessToken)
  if (!_negotiationsShapeLogged) {
    _negotiationsShapeLogged = true
    try {
      const sample = JSON.stringify(response).slice(0, 500)
      console.log("[getNegotiations] response shape:", sample)
    } catch {
      console.log("[getNegotiations] response shape: <unserializable>")
    }
  }
  return response as HHNegotiationsResponse
}

// Сообщения переговоров — нужны для определения, отправляли ли работодателю уже
// что-то по этому отклику (битые ссылки в прошлых прогонах).
export interface HHNegotiationMessage {
  id?: string
  author?: { participant_type?: "employer" | "applicant" | string }
  kind?: string
  text?: string
  created_at?: string
}

export async function getNegotiationMessages(
  accessToken: string,
  negotiationId: string,
): Promise<HHNegotiationMessage[]> {
  const data = await hhFetch<{ items?: HHNegotiationMessage[] }>(
    `/negotiations/${negotiationId}/messages`,
    accessToken,
  )
  return data?.items ?? []
}

// ─── Полное резюме (/resumes/{id}) ──────────────────────────────────────────
//
// /negotiations возвращает только preview-резюме (без контактов, языков, навыков
// и т.д.). Полные данные доступны только работодателю через /resumes/{id}.
// Если резюме скрыто работодателем (приватное) — hh отдаёт 403, и это нормальная
// ситуация: кандидат остаётся синхронизированным, просто без расширенных полей.

export interface HHFullResume {
  id?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  birth_date?: string
  age?: number
  gender?: { id?: string; name?: string }
  area?: { id?: string; name?: string }
  metro?: { id?: string; name?: string; line?: { name?: string } }
  citizenship?: { id?: string; name?: string }[]
  work_ticket?: { id?: string; name?: string }[]
  travel_time?: { id?: string; name?: string }
  relocation?: unknown
  business_trip_readiness?: { id?: string; name?: string }
  contact?: unknown[]
  site?: unknown[]
  language?: unknown[]
  skill_set?: string[]
  skills?: string
  recommendation?: unknown[]
  portfolio?: unknown[]
  certificate?: unknown[]
  education?: { attestation?: unknown[] } & Record<string, unknown>
  has_vehicle?: boolean
  driver_license_types?: { id?: string }[]
  preferred_communication_method?: { id?: string; name?: string }
  experience?: unknown[]
  total_experience?: { months?: number }
  salary?: { amount?: number; currency?: string }
  photo?: Record<string, unknown> | null
  alternate_url?: string
  // hh добавляет ещё много полей — оставляем расширяемым
  [key: string]: unknown
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Возвращает полное резюме либо null. Не бросает на 403/404/429/5xx —
// это штатные «не получилось», синк не должен из-за них падать.
export async function fetchHhResume(
  accessToken: string,
  resumeId: string,
): Promise<HHFullResume | null> {
  const url = `${HH_API_BASE}/resumes/${encodeURIComponent(resumeId)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
        },
      })
    } catch (err) {
      console.warn(`[hh:resume:network] ${resumeId}`, err instanceof Error ? err.message : err)
      return null
    }

    if (res.ok) {
      try {
        return (await res.json()) as HHFullResume
      } catch (err) {
        console.warn(`[hh:resume:parse] ${resumeId}`, err instanceof Error ? err.message : err)
        return null
      }
    }

    if (res.status === 403) {
      console.info(`[hh:resume:forbidden] ${resumeId} — резюме приватное или недоступно`)
      return null
    }
    if (res.status === 404) {
      console.info(`[hh:resume:not_found] ${resumeId} — резюме удалено`)
      return null
    }
    if (res.status === 429 && attempt === 0) {
      console.warn(`[hh:resume:rate_limit] ${resumeId} — пауза 60с и повтор`)
      await sleep(60_000)
      continue
    }

    const text = await res.text().catch(() => "")
    console.warn(`[hh:resume:http_${res.status}] ${resumeId} ${text.slice(0, 200)}`)
    return null
  }
  return null
}

export async function changeNegotiationState(
  accessToken: string,
  negotiationId: string,
  // invitation/assessment/discard — legacy 3 действия (обратная совместимость).
  // interview/consider — добавлены для воронки v2 (стадии «Интервью»/«Первичный контакт»).
  action: "invitation" | "discard" | "assessment" | "interview" | "consider",
  message?: string,
  _vacancyId?: string,
  _resumeId?: string,
  companyId?: string,   // для per-company Telegram-алерта стража (необязателен)
): Promise<void> {
  // Маппинг на hh negotiation endpoints (PUT /negotiations/{action}/{id}):
  //   invitation → phone_interview (Телефонное интервью / первый контакт)
  //   assessment → assessment (Тестовое задание)
  //   interview  → interview (Собеседование)
  //   consider   → consider (Подумать / первичный контакт)
  //   discard    → discard_by_employer (Отказ)
  const hhAction = action === "invitation" ? "phone_interview"
    : action === "assessment" ? "assessment"
    : action === "interview" ? "interview"
    : action === "consider" ? "consider"
    : "discard_by_employer"
  // Финальный страж: чистим текст от неподставленных {{переменных}} и артефактов
  // ПЕРЕД отправкой (Юрий 27.06). Битый/пустой текст — стадию меняем, но текст не шлём.
  const bodyParams = new URLSearchParams()
  if (message) {
    const g = guardOutgoingMessage(message)
    if (g.issues.length) {
      console.warn("[outgoing-guard] changeNegotiationState", { hhAction, negotiationId, issues: g.issues })
      void maybeAlertGuardIssue(g.issues, { source: "changeNegotiationState", negotiationId, companyId })
      // Hold (Option 2): если включён — придерживаем, НЕ шлём и НЕ меняем стадию.
      if (await maybeHoldMessage({ companyId, hhResponseId: negotiationId, text: g.text, issues: g.issues, source: "changeNegotiationState" })) return
    }
    if (g.safe) bodyParams.set("message", g.text)
  }
  const url = `${HH_API_BASE}/negotiations/${hhAction}/${negotiationId}`
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HH ${hhAction} ${negotiationId} failed: ${res.status} ${text}`)
  }
}

// Отправить сообщение кандидату БЕЗ смены стадии воронки hh
// (POST /negotiations/{id}/messages). Используется воронкой v2, когда у стадии
// hhStatus = «— не менять —»: текст уходит, hh-папка кандидата не трогается.
export async function sendNegotiationMessage(
  accessToken: string,
  negotiationId: string,
  message: string,
  companyId?: string,   // для per-company Telegram-алерта стража (необязателен)
): Promise<void> {
  // Финальный страж текста перед отправкой. Пустой/битый после чистки — не шлём.
  const g = guardOutgoingMessage(message)
  if (g.issues.length) {
    console.warn("[outgoing-guard] sendNegotiationMessage", { negotiationId, issues: g.issues })
    void maybeAlertGuardIssue(g.issues, { source: "sendNegotiationMessage", negotiationId, companyId })
    // Hold (Option 2): если включён — придерживаем, НЕ шлём.
    if (await maybeHoldMessage({ companyId, hhResponseId: negotiationId, text: g.text, issues: g.issues, source: "sendNegotiationMessage" })) return
  }
  if (!g.safe) throw new Error(`HH message ${negotiationId} skipped: empty after guard`)
  const body = new URLSearchParams()
  body.set("message", g.text)
  const res = await fetch(`${HH_API_BASE}/negotiations/${negotiationId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HH message ${negotiationId} failed: ${res.status} ${text}`)
  }
}
