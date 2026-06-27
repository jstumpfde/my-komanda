// Эффективные дефолтные тексты AI чат-бота для компании:
//   платформа (platform_settings) → компания (hiring_defaults_json.chatbotDefaults).
// Вакансия перебивает на стороне вызова (vac.настройки || effective.X).
//
// НЕ хардкод. Fail-safe: осечка → платформа → сид. Кэш 60с на companyId.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, type ChatbotDefaults, type CompanyHiringDefaults } from "@/lib/db/schema"
import { getPlatformChatbotDefaults } from "@/lib/platform/settings"

const cache = new Map<string, { value: ChatbotDefaults; ts: number }>()
const TTL_MS = 60_000

function pick(company: string | undefined, platform: string): string {
  return company && company.trim() ? company : platform
}

export async function getEffectiveChatbotDefaults(companyId: string): Promise<ChatbotDefaults> {
  const now = Date.now()
  const hit = cache.get(companyId)
  if (hit && now - hit.ts < TTL_MS) return hit.value

  const platform = await getPlatformChatbotDefaults()

  let c: Partial<ChatbotDefaults> = {}
  try {
    const [row] = await db
      .select({ hd: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    const hd = (row?.hd as CompanyHiringDefaults | null) ?? null
    c = hd?.chatbotDefaults ?? {}
  } catch {
    // осечка → платформенный уровень
  }

  const value: ChatbotDefaults = {
    rejectionInjection:     pick(c.rejectionInjection,     platform.rejectionInjection),
    rejectionSevereAbuse:   pick(c.rejectionSevereAbuse,   platform.rejectionSevereAbuse),
    rejectionRepeatedAbuse: pick(c.rejectionRepeatedAbuse, platform.rejectionRepeatedAbuse),
    rejectionUnstable:      pick(c.rejectionUnstable,      platform.rejectionUnstable),
    firstWarning:           pick(c.firstWarning,           platform.firstWarning),
    shortMessages:          (Array.isArray(c.shortMessages) && c.shortMessages.length > 0) ? c.shortMessages : platform.shortMessages,
    prequalReminderD1:      pick(c.prequalReminderD1,      platform.prequalReminderD1),
    prequalReminderD3:      pick(c.prequalReminderD3,      platform.prequalReminderD3),
  }

  cache.set(companyId, { value, ts: now })
  return value
}

export function clearChatbotDefaultsCache(companyId?: string): void {
  if (companyId) cache.delete(companyId)
  else cache.clear()
}
