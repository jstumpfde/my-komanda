// F6: резолвер платформенного baseline стоп-слов с кэшем (горячий путь —
// дожим-крон, scan-incoming, чат-бот). Источник — platform_settings
// (редактируемо), дефолт — код-сид STOP_WORDS. Кэш 60с: запись правят редко,
// а матчинг вызывается на каждое сообщение/касание.
import { getPlatformStopWordsBaseline } from "@/lib/platform/settings"
import { STOP_WORDS } from "@/lib/followup/stop-words"

let _cache: string[] | null = null
let _cachedAt = 0
const TTL_MS = 60_000

export async function getBaselineStopWords(): Promise<string[]> {
  const now = Date.now()
  if (_cache && now - _cachedAt < TTL_MS) return _cache
  try {
    _cache = await getPlatformStopWordsBaseline()
  } catch {
    _cache = [...STOP_WORDS]
  }
  _cachedAt = now
  return _cache
}

/** Сбросить кэш (после правки baseline в админке — чтобы применилось сразу). */
export function clearStopWordsCache(): void {
  _cache = null
  _cachedAt = 0
}
