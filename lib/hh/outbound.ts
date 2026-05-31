// lib/hh/outbound.ts
//
// hh API для модуля «Исходящий подбор» (Фаза 1).
//
// Принципы (см. §10 ТЗ — повторяем существующие паттерны, не изобретаем путь):
//   - Токен берём через getValidToken(companyId) из lib/hh-helpers (тот же путь,
//     что scan-incoming / cron). Авто-рефреш истёкших — внутри getValidToken.
//   - Прямые вызовы https://api.hh.ru с Authorization + User-Agent (как lib/hh-api.ts).
//     Отдельного RU-прокси для hh в проекте нет (прокси только для Claude API).
//   - INTEGRATIONS_DISABLED=true (стейджинг) → hh-вызовы кидают ошибку.
//
// Лимиты hh (§3 ТЗ):
//   - GET /resumes (ПОИСК) — НЕ расходует лимит просмотров. Возвращает сниппеты.
//   - GET /resumes/{id} (ПОЛНЫЙ просмотр) — расходует лимит (50 из поиска/день +
//     500 суммарно/день). Учёт — hh_resume_view_quota, см. quota-хелперы ниже.

import { getValidToken } from "@/lib/hh-helpers"

const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24/1.0 (company24.pro)"

// Дневные лимиты hh (§3 ТЗ). Захардкожены — у hh нет публичного эндпоинта,
// возвращающего точные остатки лимита по менеджеру.
export const DAILY_SEARCH_VIEW_LIMIT = 50
export const DAILY_TOTAL_VIEW_LIMIT = 500

// ─── Критерии поиска ────────────────────────────────────────────────────────
// Нормализованная форма критериев (хранится в outbound_searches.criteria и
// приходит от UI). Все поля опциональны.
export interface OutboundCriteria {
  text?: string            // ключевые слова (заголовок/навыки)
  area?: string            // hh area id (например "1" = Москва). По названию города
                           // маппинг делает UI/роут через /areas — здесь только id.
  experience?: string      // hh experience id: noExperience | between1And3 | between3And6 | moreThan6
  salaryFrom?: number
  salaryTo?: number
  period?: number          // за сколько дней резюме обновлено (например 30)
  perPage?: number         // размер страницы (cap 100)
  page?: number
}

// ─── Сниппет резюме из поисковой выдачи ─────────────────────────────────────
// Подмножество полей GET /resumes (не расходует лимит). Полные контакты/ФИО
// доступны только в GET /resumes/{id}.
export interface ResumeSnippet {
  id: string
  title?: string | null
  area?: { id?: string; name?: string } | null
  age?: number | null
  salary?: { amount?: number | null; currency?: string | null } | null
  total_experience?: { months?: number | null } | null
  experience?: Array<{ company?: string | null; position?: string | null; description?: string | null }> | null
  skill_set?: string[] | null
  first_name?: string | null
  last_name?: string | null
  // Сырые остальные поля для AI/диагностики.
  [key: string]: unknown
}

export interface ResumeSearchResult {
  items: ResumeSnippet[]
  found: number
  pages: number
  page: number
  per_page: number
}

function assertEnabled(url: string) {
  if (process.env.INTEGRATIONS_DISABLED === "true") {
    console.log("[INTEGRATIONS_DISABLED] hh.ru outbound call skipped:", url)
    throw new Error("hh.ru disabled on staging")
  }
}

async function hhGet<T>(companyId: string, path: string): Promise<T> {
  const url = `${HH_API_BASE}${path}`
  assertEnabled(url)

  const tokenInfo = await getValidToken(companyId)
  if (!tokenInfo) throw new Error("hh.ru не подключён или токен недоступен")

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokenInfo.accessToken}`,
      "User-Agent": USER_AGENT,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`HH API ${path} failed: ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

async function hhPost<T>(companyId: string, path: string, body: unknown): Promise<T> {
  const url = `${HH_API_BASE}${path}`
  assertEnabled(url)

  const tokenInfo = await getValidToken(companyId)
  if (!tokenInfo) throw new Error("hh.ru не подключён или токен недоступен")

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenInfo.accessToken}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HH API ${path} failed: ${res.status} ${text.slice(0, 300)}`)
  }
  // Некоторые negotiations-эндпоинты возвращают пустое тело (204).
  if (res.status === 204) return undefined as unknown as T
  const raw = await res.text()
  return (raw ? JSON.parse(raw) : undefined) as T
}

// ─── Поиск резюме (НЕ расходует лимит просмотров) ───────────────────────────
export async function searchResumes(
  companyId: string,
  criteria: OutboundCriteria,
): Promise<ResumeSearchResult> {
  const qs = new URLSearchParams()
  if (criteria.text) qs.set("text", criteria.text)
  if (criteria.area) qs.set("area", criteria.area)
  if (criteria.experience) qs.set("experience", criteria.experience)
  if (criteria.salaryFrom != null) qs.set("salary_from", String(criteria.salaryFrom))
  if (criteria.salaryTo != null) qs.set("salary_to", String(criteria.salaryTo))
  if (criteria.period != null) qs.set("period", String(criteria.period))
  qs.set("per_page", String(Math.min(criteria.perPage ?? 50, 100)))
  qs.set("page", String(criteria.page ?? 0))

  const data = await hhGet<ResumeSearchResult>(companyId, `/resumes?${qs.toString()}`)
  return {
    items: data.items ?? [],
    found: data.found ?? 0,
    pages: data.pages ?? 1,
    page: data.page ?? 0,
    per_page: data.per_page ?? (criteria.perPage ?? 50),
  }
}

// ─── Полный просмотр резюме (РАСХОДУЕТ лимит) ───────────────────────────────
// Вызывать только для топовых перед приглашением. Учёт квоты — на стороне
// вызывающего (incrementResumeViewQuota), здесь только сетевой вызов.
export async function getResume(companyId: string, resumeId: string): Promise<ResumeSnippet> {
  return hhGet<ResumeSnippet>(companyId, `/resumes/${encodeURIComponent(resumeId)}`)
}

// ─── Проверка доступа к базе резюме (§3.2 ТЗ) ───────────────────────────────
// Приглашения требуют активированного платного доступа к базе резюме hh.
// Точного эндпоинта «есть ли доступ» у hh нет; conservative-эвристика:
// employer manager-настройки → resume_search_status / поля доступа.
//
// TODO: сверить с docs/employer_negotiations.md (и /employers/{id}/managers)
// перед боевым включением — какой именно флаг hh отдаёт для платного доступа.
// Пока: пробуем GET /resumes с per_page=0; 403/forbidden трактуем как «нет
// доступа», 200 — как «есть базовый поиск» (поиск доступен и без платного
// доступа к контактам, поэтому это НЕ гарантия что приглашения разрешены —
// финальную проверку даёт сам negotiations-вызов).
export async function checkResumeDatabaseAccess(companyId: string): Promise<{
  hasAccess: boolean
  reason?: string
}> {
  try {
    // Лёгкий probe — поиск без расхода лимита.
    await hhGet<ResumeSearchResult>(companyId, `/resumes?per_page=1&page=0`)
    // Поиск прошёл. Доступ к приглашениям подтверждается фактическим
    // negotiations-вызовом; здесь возвращаем оптимистично true, но роут
    // invite дополнительно ловит 403 от negotiations и сообщает HR.
    return { hasAccess: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/40[13]/.test(msg)) {
      return { hasAccess: false, reason: "Доступ к базе резюме hh не активен" }
    }
    // Сетевая/иная ошибка — не блокируем кнопку жёстко, но помечаем.
    return { hasAccess: false, reason: msg.slice(0, 200) }
  }
}

// ─── Приглашение откликнуться (negotiations) ────────────────────────────────
// КОНСЕРВАТИВНАЯ реализация по §4 ТЗ. Поток:
//   1. Запросить применимые вакансии работодателя к резюме:
//      GET /resumes/{resume_id}/negotiations_history ИЛИ
//      GET /vacancies/{vacancy_id}/... — формат «arguments / resulting_employer_state»
//      у hh неточен в офлайне.
//   2. Создать приглашение POST /negotiations с vacancy_id + resume_id + message.
//
// TODO(ВЕРИФИЦИРОВАТЬ ПЕРЕД БОЕВЫМ ВКЛЮЧЕНИЕМ): сверить точный путь и тело
// employer-приглашения с docs/employer_negotiations.md. Ниже — наиболее
// вероятная форма (POST /negotiations с form-подобным JSON). Пара
// «вакансия+резюме» = одно приглашение.
export interface InviteResult {
  resumeId: string
  ok: boolean
  error?: string
}

export async function inviteResumeToVacancy(
  companyId: string,
  params: { hhVacancyId: string; resumeId: string; message: string },
): Promise<InviteResult> {
  try {
    // TODO: сверить с docs/employer_negotiations.md — реальный эндпоинт и поля.
    // По доке hh employer-приглашение создаётся POST /negotiations с указанием
    // vacancy_id, resume_id и message. Часть аккаунтов требует предварительного
    // запроса «применимых вакансий» (resulting_employer_state) — этот шаг мы
    // НЕ выполняем вслепую, чтобы не угадывать формат: если hh вернёт ошибку
    // «требуется выбор вакансии», роут покажет её HR.
    await hhPost<unknown>(companyId, `/negotiations`, {
      vacancy_id: params.hhVacancyId,
      resume_id: params.resumeId,
      message: params.message,
    })
    return { resumeId: params.resumeId, ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { resumeId: params.resumeId, ok: false, error: msg }
  }
}

// ─── Хелперы маппинга сниппета → данные для AI/UI ───────────────────────────
export function snippetExperienceYears(s: ResumeSnippet): number | null {
  const months = s.total_experience?.months
  if (months == null) return null
  return Math.round((months / 12) * 10) / 10
}

export function snippetSummaryText(s: ResumeSnippet): string {
  const parts: string[] = []
  if (s.title) parts.push(`Должность в резюме: ${s.title}`)
  const years = snippetExperienceYears(s)
  if (years != null) parts.push(`Опыт: ${years} лет`)
  if (s.area?.name) parts.push(`Город: ${s.area.name}`)
  if (s.salary?.amount != null) parts.push(`Ожид. ЗП: ${s.salary.amount} ${s.salary.currency ?? ""}`.trim())
  if (s.skill_set?.length) parts.push(`Навыки: ${s.skill_set.slice(0, 30).join(", ")}`)
  const exp = (s.experience ?? [])
    .slice(0, 5)
    .map(e => [e.position, e.company, e.description].filter(Boolean).join(" — "))
    .filter(Boolean)
  if (exp.length) parts.push(`Места работы:\n${exp.join("\n")}`)
  return parts.join("\n")
}
