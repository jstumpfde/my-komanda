// Чтение самообучающегося ПЛАТФОРМЕННОГО справочника имён (learned_given_names).
// Наполняется cron'ом /api/cron/learn-given-names (см. lib/db/schema.ts —
// learnedGivenNames). Множество нормализованных (lower-case) имён — передаётся
// НЕОБЯЗАТЕЛЬНЫМ параметром в resolveGivenNameMeta, чтобы резолвер оставался
// чистым (без обращения к БД).
//
// In-memory кэш на 10 минут (module-level, переживает запросы в рамках одного
// процесса). Fail-safe: ошибка БД → пустой Set (ведём себя как раньше, без
// регрессии — просто предупреждение «⚠ имя не из справочника» не снимается).

import { db } from "@/lib/db"
import { learnedGivenNames } from "@/lib/db/schema"

const CACHE_TTL_MS = 10 * 60 * 1000

let cache: { set: Set<string>; loadedAt: number } | null = null

async function loadLearnedNamesSet(): Promise<Set<string>> {
  try {
    const rows = await db.select({ nameNorm: learnedGivenNames.nameNorm }).from(learnedGivenNames)
    return new Set(rows.map((r) => r.nameNorm))
  } catch (err) {
    console.warn("[learned-given-names] load failed:", err instanceof Error ? err.message : err)
    return new Set()
  }
}

/** Множество выученных имён (нормализованных, lower-case), с кэшем на 10 минут. */
export async function getLearnedNamesSet(): Promise<Set<string>> {
  const now = Date.now()
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.set
  const set = await loadLearnedNamesSet()
  cache = { set, loadedAt: now }
  return set
}

/** Сбросить кэш (для тестов/сразу после майнинга, если нужна свежая выборка). */
export function invalidateLearnedNamesCache(): void {
  cache = null
}
