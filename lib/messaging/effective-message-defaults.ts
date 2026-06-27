// Эффективные дефолтные тексты для компании: наследование
//   платформа (platform_settings) → компания (hiring_defaults_json.messageDefaults).
// Вакансия перебивает уже на стороне вызова (vac.X || effective.X).
//
// НЕ хардкод: всё редактируемо. Код-константы участвуют только как платформенный
// сид (MESSAGE_DEFAULTS_SEED). Резолвер fail-safe: любая осечка → платформенный
// уровень → сид. Короткий кэш (60с) на companyId, чтобы не бить БД в горячем
// пути hh-обработки.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, type MessageDefaults, type CompanyHiringDefaults } from "@/lib/db/schema"
import { getPlatformMessageDefaults } from "@/lib/platform/settings"

const cache = new Map<string, { value: MessageDefaults; ts: number }>()
const TTL_MS = 60_000

function pickStr(company: string | undefined, platform: string): string {
  return company && company.trim() ? company : platform
}

export async function getEffectiveMessageDefaults(companyId: string): Promise<MessageDefaults> {
  const now = Date.now()
  const hit = cache.get(companyId)
  if (hit && now - hit.ts < TTL_MS) return hit.value

  const platform = await getPlatformMessageDefaults()

  let company: Partial<MessageDefaults> = {}
  try {
    const [row] = await db
      .select({ hd: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    const hd = (row?.hd as CompanyHiringDefaults | null) ?? null
    company = hd?.messageDefaults ?? {}
  } catch {
    // осечка БД → остаёмся на платформенном уровне (fail-safe)
  }

  const value: MessageDefaults = {
    inviteMessage:   pickStr(company.inviteMessage,   platform.inviteMessage),
    offHoursMessage: pickStr(company.offHoursMessage, platform.offHoursMessage),
    firstMessageDelaySeconds:
      typeof company.firstMessageDelaySeconds === "number" && company.firstMessageDelaySeconds >= 0
        ? company.firstMessageDelaySeconds
        : platform.firstMessageDelaySeconds,
    rejectMessage:   pickStr(company.rejectMessage,   platform.rejectMessage),
  }

  cache.set(companyId, { value, ts: now })
  return value
}

// Сбросить кэш (после правки дефолтов компании/платформы).
export function clearMessageDefaultsCache(companyId?: string): void {
  if (companyId) cache.delete(companyId)
  else cache.clear()
}
