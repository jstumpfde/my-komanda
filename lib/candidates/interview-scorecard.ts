// Скоркарта интервью (Company24, дизайн координатора, одобрен Юрием 05.07).
//
// Данные: candidates.interview_score (1-10, null) + candidates.interview_scorecard_json
// (миграция drizzle/0258). Критерии генерируются из Портрета вакансии (mustHave +
// niceToHave, см. lib/core/spec/types.ts) + 3 универсальных (не из Портрета).
//
// СТАТУС: боевой контур — читается/пишется candidate-drawer.tsx (таб «Итоги») и
// PATCH /api/modules/hr/candidates/[id]/interview-scorecard.

import type { CandidateSpec } from "@/lib/core/spec/types"
import { normalizeMustHave, normalizeNiceToHave } from "@/lib/core/spec/types"

// ─── Типы ───────────────────────────────────────────────────────────────────

export type ScorecardCriterionSource = "portrait" | "universal"
export type ScorecardVerdict = "confirmed" | "not_confirmed" | "not_checked"

export interface ScorecardCriterion {
  key:     string
  label:   string
  source:  ScorecardCriterionSource
  verdict: ScorecardVerdict
  /** Must-have-пункты Портрета весят ×2 в авто-балле. Универсальные/nice — вес 1. */
  weight:  1 | 2
}

export interface InterviewScorecard {
  criteria: ScorecardCriterion[]
  /** Авто-балл 1-10, посчитанный из criteria (computeAutoScore). null = все «не проверяли». */
  autoScore: number | null
  /** Ручной балл HR (1-10), если задан — перекрывает autoScore в interview_score. */
  manualOverride: number | null
  decidedBy: string | null
  decidedAt: string | null
}

/** Три универсальных критерия — не из Портрета, добавляются всегда. */
export const UNIVERSAL_CRITERIA: ReadonlyArray<{ key: string; label: string }> = [
  { key: "universal_communication", label: "Коммуникация и впечатление" },
  { key: "universal_motivation",    label: "Мотивация" },
  { key: "universal_team_fit",      label: "Взял бы в команду" },
]

// ─── Генерация критериев из Портрета ────────────────────────────────────────

/** snake_case-ключ из произвольного текста заголовка (стабильный, для React key). */
function slugifyKey(prefix: string, text: string, index: number): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
  return `${prefix}_${base || index}`
}

/**
 * Строит начальный набор критериев скоркарты из Портрета вакансии (spec) +
 * 3 универсальных. mustHave → weight×2 (Портрет, обязательные), niceToHave →
 * weight×1 (Портрет, желательные). Все вердикты стартуют как "not_checked".
 *
 * Вызывается ОДИН РАЗ при первом открытии скоркарты кандидата (когда
 * interview_scorecard_json ещё пуст) — дальше состояние живёт в БД и
 * generateCriteria не перезаписывает уже принятые решения HR.
 */
export function generateCriteriaFromSpec(spec: CandidateSpec | null | undefined): ScorecardCriterion[] {
  const out: ScorecardCriterion[] = []

  if (spec) {
    const must = normalizeMustHave(spec.mustHave)
    must.forEach((m, i) => {
      out.push({
        key:     slugifyKey("must", m.text, i),
        label:   m.text,
        source:  "portrait",
        verdict: "not_checked",
        weight:  2,
      })
    })

    const nice = normalizeNiceToHave(spec.niceToHave)
    nice.forEach((n, i) => {
      out.push({
        key:     slugifyKey("nice", n.text, i),
        label:   n.text,
        source:  "portrait",
        verdict: "not_checked",
        weight:  1,
      })
    })
  }

  for (const u of UNIVERSAL_CRITERIA) {
    out.push({
      key:     u.key,
      label:   u.label,
      source:  "universal",
      verdict: "not_checked",
      weight:  1,
    })
  }

  return out
}

// ─── Авто-балл ──────────────────────────────────────────────────────────────

/**
 * autoScore = round(10 × подтверждённые/(подтверждённые+неподтверждённые)),
 * с весом must-have ×2 (Портрет). «Не проверяли» — вне знаменателя.
 * Если знаменатель = 0 (все "not_checked" или список пуст) → null (балла нет).
 *
 * Пример: 2 must-have (вес 2) confirmed + 1 nice (вес 1) not_confirmed
 *   → confirmed=4, denom=4+1=5 → round(10×4/5) = 8.
 */
export function computeAutoScore(criteria: ReadonlyArray<ScorecardCriterion>): number | null {
  let confirmedWeight = 0
  let denomWeight = 0

  for (const c of criteria) {
    if (c.verdict === "not_checked") continue
    denomWeight += c.weight
    if (c.verdict === "confirmed") confirmedWeight += c.weight
  }

  if (denomWeight === 0) return null

  // 0 — валидный результат (ни один проверенный критерий не подтвердился),
  // клампим только сверху (защита от округления 10.0000001 из-за float).
  const raw = Math.round(10 * (confirmedWeight / denomWeight))
  return Math.min(10, Math.max(0, raw))
}

/** interview_score = manualOverride ?? autoScore. */
export function resolveInterviewScore(scorecard: Pick<InterviewScorecard, "autoScore" | "manualOverride">): number | null {
  return scorecard.manualOverride ?? scorecard.autoScore
}

// ─── Пустая скоркарта (fallback) ────────────────────────────────────────────

export function emptyScorecard(): InterviewScorecard {
  return {
    criteria: [],
    autoScore: null,
    manualOverride: null,
    decidedBy: null,
    decidedAt: null,
  }
}
