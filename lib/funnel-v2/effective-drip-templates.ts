// Эффективные drip-шаблоны дожима: наследование
//   платформа (platform_settings['drip_templates'])
//   → компания (hiring_defaults_json.dripTemplates, опционально)
//   → код-сид (DRIP_TEMPLATES_SEED).
//
// НЕ хардкод: всё редактируемо. Код-константы участвуют только как платформенный
// сид. Резолвер fail-safe: любая осечка → платформенный уровень → сид. Короткий
// кэш (60с) на companyId (и на "__platform__" без компании), чтобы не бить БД в
// горячем пути рантайма воронки.
//
// Аналог lib/messaging/effective-message-defaults.ts (1:1 по паттерну).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, type DripTemplates, type CompanyHiringDefaults } from "@/lib/db/schema"
import { getPlatformDripTemplates } from "@/lib/platform/settings"

const cache = new Map<string, { value: DripTemplates; ts: number }>()
const TTL_MS = 60_000
const PLATFORM_KEY = "__platform__"

// Непустой массив строк из company-override, иначе платформенный уровень.
function pickArr(company: unknown, platform: string[]): string[] {
  return Array.isArray(company) && company.length > 0 && company.every(s => typeof s === "string")
    ? (company as string[])
    : platform
}

/**
 * Эффективные drip-шаблоны для компании (или платформенные, если companyId не задан).
 * Приоритет: company override → platform → код-сид. Никогда не падает.
 */
export async function getDripTemplates(companyId?: string): Promise<DripTemplates> {
  const key = companyId || PLATFORM_KEY
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.ts < TTL_MS) return hit.value

  const platform = await getPlatformDripTemplates()

  if (!companyId) {
    cache.set(key, { value: platform, ts: now })
    return platform
  }

  let company: Partial<DripTemplates> = {}
  try {
    const [row] = await db
      .select({ hd: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    const hd = (row?.hd as CompanyHiringDefaults | null) ?? null
    company = hd?.dripTemplates ?? {}
  } catch {
    // осечка БД → остаёмся на платформенном уровне (fail-safe)
  }

  const value: DripTemplates = {
    stepWords: (company.stepWords && typeof company.stepWords === "object")
      ? { ...platform.stepWords, ...company.stepWords }
      : platform.stepWords,
    branchA: pickArr(company.branchA, platform.branchA),
    branchB: pickArr(company.branchB, platform.branchB),
    live:    pickArr(company.live,    platform.live),
    offer:   pickArr(company.offer,   platform.offer),
  }

  cache.set(key, { value, ts: now })
  return value
}

// Сбросить кэш (после правки дефолтов компании/платформы).
export function clearDripTemplatesCache(companyId?: string): void {
  if (companyId) cache.delete(companyId)
  else cache.clear()
}
