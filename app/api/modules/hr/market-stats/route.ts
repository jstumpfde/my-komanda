// GET /api/modules/hr/market-stats?title=...&city=...
//
// Юрий 07.07: шаг «Анализ рынка» мастера вакансии показывал ПОЛНОСТЬЮ выдуманные
// данные (захардкоженные "медианные зарплаты" + топ-3 похожих вакансий с реальными
// брендами и выдуманными цифрами). Репутационный риск. Этот роут отдаёт РЕАЛЬНУЮ
// статистику hh.ru: используем hh-интеграцию компании (тот же токен, что и весь
// остальной hh-функционал — getValidToken из lib/hh-helpers), запрашиваем
// публичный поиск вакансий hh и считаем медиану/вилку по реальным salary-полям
// выборки. Отклики чужих вакансий hh НЕ отдаёт — эти цифры мы не показываем.

import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getValidToken } from "@/lib/hh-helpers"
import { computeMarketSalaryStats, formatHhSalary, type HhSalaryLike } from "@/lib/hh/market-stats"

const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24/1.0 (company24.pro)"
const HH_FETCH_TIMEOUT_MS = 10_000
const RUSSIA_AREA_ID = "113"

// Кэш в памяти процесса на 10 минут по ключу title+city — снижает нагрузку на hh
// при повторных открытиях шага «Анализ рынка» с теми же параметрами. Живёт до
// рестарта процесса, инвалидация не нужна (данные не критично-свежие).
const CACHE_TTL_MS = 10 * 60 * 1000
interface CacheEntry { expiresAt: number; payload: MarketStatsPayload }
const cache = new Map<string, CacheEntry>()

interface HhVacancySearchItem {
  id: string
  name: string
  employer?: { name?: string }
  salary?: { from?: number | null; to?: number | null; currency?: string | null; gross?: boolean | null }
  area?: { id?: string; name?: string }
  alternate_url?: string
}

interface HhVacancySearchResponse {
  items: HhVacancySearchItem[]
  found: number
  page: number
  pages: number
  per_page: number
}

interface HhAreaSuggest {
  text: string
  id: string
}

export interface MarketStatsPayload {
  found: number
  sampleSize: number
  salaryMedian: number | null
  salaryFrom: number | null
  salaryTo: number | null
  similar: Array<{
    name: string
    employer: string
    salary: string
    url: string | null
    area: string | null
  }>
  areaResolved: string | null
  fetchedAt: string
}

async function hhFetchTimed<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(HH_FETCH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HH API ${url} failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

// Резолвим город → hh area id через /suggests/areas (тот же публичный справочник,
// что использует lib/hh/outbound.ts для /areas, но suggests удобнее для одиночного
// текстового запроса без выкачки всего дерева). Нет совпадения — вся Россия (113).
async function resolveAreaId(accessToken: string, city: string): Promise<string> {
  const trimmed = city.trim()
  if (!trimmed) return RUSSIA_AREA_ID
  try {
    const url = `${HH_API_BASE}/suggests/areas?text=${encodeURIComponent(trimmed)}`
    const data = await hhFetchTimed<{ items?: HhAreaSuggest[] }>(url, accessToken)
    const first = data.items?.[0]
    return first?.id ?? RUSSIA_AREA_ID
  } catch (err) {
    console.warn("[market-stats] area resolve failed, ищем по всей России:", err instanceof Error ? err.message : err)
    return RUSSIA_AREA_ID
  }
}

export async function GET(req: NextRequest) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as NextResponse
  }

  const { searchParams } = new URL(req.url)
  const title = (searchParams.get("title") ?? "").trim()
  const city = (searchParams.get("city") ?? "").trim()

  if (!title) {
    return NextResponse.json({ error: "Укажите название вакансии" }, { status: 400 })
  }

  const cacheKey = `${title.toLowerCase()}|${city.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload)
  }

  const tokenResult = await getValidToken(user.companyId)
  if (!tokenResult) {
    return NextResponse.json(
      { error: "hh_not_connected", message: "Подключите hh.ru в настройках, чтобы видеть статистику рынка" },
      { status: 409 },
    )
  }

  try {
    const { accessToken } = tokenResult
    const areaId = await resolveAreaId(accessToken, city)

    const qs = new URLSearchParams({
      text: title,
      area: areaId,
      per_page: "10",
      order_by: "relevance",
    })
    const url = `${HH_API_BASE}/vacancies?${qs.toString()}`
    const data = await hhFetchTimed<HhVacancySearchResponse>(url, accessToken)

    const salaries: HhSalaryLike[] = data.items.map((it) => it.salary ?? {})
    const stats = computeMarketSalaryStats(salaries)

    const similar = data.items.slice(0, 5).map((it) => ({
      name: it.name,
      employer: it.employer?.name ?? "Не указан",
      salary: formatHhSalary(it.salary ?? null),
      url: it.alternate_url ?? null,
      area: it.area?.name ?? null,
    }))

    const payload: MarketStatsPayload = {
      found: data.found,
      sampleSize: stats.sampleSize,
      salaryMedian: stats.salaryMedian,
      salaryFrom: stats.salaryFrom,
      salaryTo: stats.salaryTo,
      similar,
      areaResolved: data.items[0]?.area?.name ?? null,
      fetchedAt: new Date().toISOString(),
    }

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload })

    return NextResponse.json(payload)
  } catch (err) {
    console.error("[market-stats]", err)
    return NextResponse.json(
      { error: "hh_request_failed", message: "Не удалось получить данные hh" },
      { status: 502 },
    )
  }
}
