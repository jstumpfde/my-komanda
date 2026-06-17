/**
 * components/vacancies/spec-editor-helpers.tsx
 *
 * Чистые хелперы UI «Портрета» (Этап 1b). Вынесены из spec-editor.tsx,
 * чтобы держать главный компонент компактным. Никаких сайд-эффектов и
 * импортов БД — только разметка значений и эвристики по CandidateSpec.
 */

import { normalizeMustHave, type CandidateSpec } from "@/lib/core/spec/types"

// ─── Важность критерия → словесный уровень ───────────────────────────────────

/**
 * Подпись уровня важности под ползунком веса.
 * Непрерывная шкала 0-100 → 5 человеческих уровней.
 */
export function importanceLabel(v: number): string {
  if (v <= 20) return "Не важно"
  if (v <= 45) return "Желательно"
  if (v <= 70) return "Важно"
  if (v <= 90) return "Критично"
  return "Обязательно"
}

// ─── Реалистичность портрета ─────────────────────────────────────────────────

export type RealismTone = "emerald" | "amber" | "red"

export interface RealismResult {
  /** Человеческий ярлык: Высокая / Средняя / Низкая. */
  level: "Высокая" | "Средняя" | "Низкая"
  tone:  RealismTone
  /** Внутренний «балл строгости» — для отладки/сортировки (0..∞). */
  score: number
  /** true → показать предупреждение о малом числе подходящих кандидатов. */
  warn:  boolean
}

/** Tailwind-классы тонов (совпадают с ScoringStrictness в anketa-tab.tsx). */
export const REALISM_TONE_CLASS: Record<RealismTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  amber:   "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  red:     "bg-red-50 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
}

/**
 * Эвристика «реалистичности» портрета: чем больше жёстких условий и выше
 * планка, тем меньше подходящих кандидатов. Ориентир для HR, не строгий
 * показатель.
 *
 * Источники строгости:
 *  - жёсткие (hard) must-have пункты         × 2.0  (каждый отсекает)
 *  - включённые стоп-факторы                  × 1.5  (авто-отказ до скоринга)
 *  - высокий верхний порог резюме (>80)       + (upper-80)/10
 *  - «лишние» критерии сверх 5 (must+nice)    × 0.7  (размывают/удлиняют)
 *  - deal-breakers                            × 1.0
 */
export function computeRealism(spec: CandidateSpec): RealismResult {
  const must = normalizeMustHave(spec.mustHave)
  const hardCount = must.filter(m => m.hard).length

  const stopFactorsEnabled = Object.values(spec.stopFactors ?? {})
    .filter(f => f && typeof f === "object" && (f as { enabled?: boolean }).enabled === true)
    .length

  const upper = spec.resumeThresholds?.enabled === false
    ? 0
    : (spec.resumeThresholds?.upperThreshold ?? 0)
  const thresholdPenalty = upper > 80 ? (upper - 80) / 10 : 0

  const totalCriteria = must.length + (spec.niceToHave?.length ?? 0)
  const overflowCriteria = Math.max(0, totalCriteria - 5)

  const dealBreakers = spec.dealBreakers?.length ?? 0

  const score =
    hardCount * 2.0 +
    stopFactorsEnabled * 1.5 +
    thresholdPenalty +
    overflowCriteria * 0.7 +
    dealBreakers * 1.0

  let level: RealismResult["level"]
  let tone: RealismTone
  if (score < 6) { level = "Высокая"; tone = "emerald" }
  else if (score < 11) { level = "Средняя"; tone = "amber" }
  else { level = "Низкая"; tone = "red" }

  return { level, tone, score, warn: score >= 11 }
}
