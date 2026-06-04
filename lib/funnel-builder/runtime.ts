// Phase 3 консолидации воронки: адаптер чтения «включён ли блок» рантаймом.
//
// Принцип безопасности (МАКСИМАЛЬНО консервативный):
//   isBlockEnabled(vacancy, type, legacyValue) возвращает legacyValue ВЕЗДЕ,
//   кроме случая, когда у вакансии явно включён funnelRuntimeEnabled И блок
//   присутствует в funnelConfigJson. Тогда источником истины становится
//   block.enabled. Если флаг выключен, конфига нет или блок отсутствует —
//   поведение побайтово равно прежнему (возвращаем legacyValue).
//
// Почему так: рантайм найма обслуживает живую вакансию с 1505 кандидатами.
// Каждый call-site передаёт СВОЁ текущее legacy-выражение как fallback —
// поэтому для всех вакансий без флага (по умолчанию все) ничего не меняется,
// а ревью тривиально: «было выражение X → стало isBlockEnabled(.., X)».
//
// Связано: drizzle/0166_funnel_runtime_enabled.sql, схема vacancies.funnelRuntimeEnabled,
// SPEC-funnel-scoring-consolidation.md (Phase 3).

import type { FunnelBlockType } from "@/lib/funnel-builder/blocks"

/** Минимальная форма вакансии, нужная адаптеру (совместима с полной строкой). */
export interface FunnelRuntimeVacancy {
  funnelRuntimeEnabled?: boolean | null
  funnelConfigJson?: { blocks?: Array<{ type?: string; order?: number; enabled?: boolean }> } | null
}

/**
 * Активен ли для вакансии режим «рантайм читает Funnel Builder».
 * Только при явном true — иначе legacy-поведение.
 */
export function isFunnelRuntimeActive(vacancy: FunnelRuntimeVacancy | null | undefined): boolean {
  return vacancy?.funnelRuntimeEnabled === true
}

/**
 * Включён ли блок воронки `type` для вакансии.
 *
 * @param vacancy     строка вакансии (нужны funnelRuntimeEnabled + funnelConfigJson)
 * @param type        тип блока Funnel Builder (ai_chatbot, stop_factors_resume, ...)
 * @param legacyValue РОВНО то булево, которое call-site вычислил бы по legacy-полям
 *                    (включая дефолты, напр. `settings.stopFactorsEnabled !== false`)
 * @returns           legacyValue, если режим неактивен/блока нет; иначе block.enabled
 */
export function isBlockEnabled(
  vacancy: FunnelRuntimeVacancy | null | undefined,
  type: FunnelBlockType,
  legacyValue: boolean,
): boolean {
  // Флаг выключен (по умолчанию у всех) → прежнее поведение, без исключений.
  if (!isFunnelRuntimeActive(vacancy)) return legacyValue

  const blocks = vacancy?.funnelConfigJson?.blocks
  if (!Array.isArray(blocks)) return legacyValue

  const block = blocks.find(b => b?.type === type)
  // Блок не описан в конфиге → не «теряем» поведение, fallback на legacy.
  if (!block) return legacyValue

  return block.enabled === true
}
