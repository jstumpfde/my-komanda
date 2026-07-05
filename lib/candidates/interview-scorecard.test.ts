// Юнит-тесты авто-балла скоркарты интервью (computeAutoScore).
// Запуск: pnpm exec tsx --test lib/candidates/interview-scorecard.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeAutoScore, resolveInterviewScore, generateCriteriaFromSpec, type ScorecardCriterion } from "./interview-scorecard"
import type { CandidateSpec } from "@/lib/core/spec/types"

function c(partial: Partial<ScorecardCriterion> & Pick<ScorecardCriterion, "verdict" | "weight">): ScorecardCriterion {
  return {
    key: partial.key ?? "k",
    label: partial.label ?? "L",
    source: partial.source ?? "universal",
    verdict: partial.verdict,
    weight: partial.weight,
  }
}

test("computeAutoScore: пустой список → null", () => {
  assert.equal(computeAutoScore([]), null)
})

test("computeAutoScore: все not_checked → null (балла нет)", () => {
  assert.equal(computeAutoScore([
    c({ verdict: "not_checked", weight: 1 }),
    c({ verdict: "not_checked", weight: 2 }),
  ]), null)
})

test("computeAutoScore: все confirmed → 10", () => {
  assert.equal(computeAutoScore([
    c({ verdict: "confirmed", weight: 1 }),
    c({ verdict: "confirmed", weight: 2 }),
  ]), 10)
})

test("computeAutoScore: все not_confirmed → 0 (валидный результат, не null)", () => {
  assert.equal(computeAutoScore([
    c({ verdict: "not_confirmed", weight: 1 }),
    c({ verdict: "not_confirmed", weight: 2 }),
  ]), 0)
})

test("computeAutoScore: пример из ТЗ — 2 must-have(×2) confirmed + 1 nice(×1) not_confirmed → 8", () => {
  const criteria = [
    c({ verdict: "confirmed", weight: 2 }),
    c({ verdict: "confirmed", weight: 2 }),
    c({ verdict: "not_confirmed", weight: 1 }),
  ]
  // confirmedWeight = 4, denom = 4+1 = 5 → round(10*4/5) = 8
  assert.equal(computeAutoScore(criteria), 8)
})

test("computeAutoScore: not_checked не входит в знаменатель", () => {
  const criteria = [
    c({ verdict: "confirmed", weight: 2 }),
    c({ verdict: "not_checked", weight: 2 }),      // игнорируется
    c({ verdict: "not_confirmed", weight: 1 }),
  ]
  // confirmedWeight = 2, denom = 2+1 = 3 → round(10*2/3) = round(6.67) = 7
  assert.equal(computeAutoScore(criteria), 7)
})

test("computeAutoScore: must-have весит вдвое сильнее nice/universal", () => {
  // 1 must-have confirmed (weight 2) vs 1 universal not_confirmed (weight 1)
  // confirmedWeight=2, denom=3 → round(20/3)=round(6.67)=7 (перевешивает подтверждённый must-have)
  const criteria = [
    c({ verdict: "confirmed", weight: 2, source: "portrait" }),
    c({ verdict: "not_confirmed", weight: 1, source: "universal" }),
  ]
  assert.equal(computeAutoScore(criteria), 7)
})

test("resolveInterviewScore: manualOverride перекрывает autoScore", () => {
  assert.equal(resolveInterviewScore({ autoScore: 5, manualOverride: 9 }), 9)
  assert.equal(resolveInterviewScore({ autoScore: 5, manualOverride: null }), 5)
  assert.equal(resolveInterviewScore({ autoScore: null, manualOverride: null }), null)
})

test("generateCriteriaFromSpec: mustHave → weight 2, niceToHave → weight 1, + 3 универсальных", () => {
  const spec = {
    mustHave: ["Опыт продаж B2B", { text: "Английский язык", hard: true }],
    niceToHave: [{ text: "Знание CRM", importance: "nice" }],
  } as unknown as CandidateSpec

  const criteria = generateCriteriaFromSpec(spec)
  const portraitCriteria = criteria.filter(c => c.source === "portrait")
  const universalCriteria = criteria.filter(c => c.source === "universal")

  assert.equal(portraitCriteria.length, 3) // 2 must-have + 1 nice
  assert.equal(universalCriteria.length, 3)
  assert.ok(portraitCriteria.filter(c => c.weight === 2).length === 2, "оба mustHave весят 2")
  assert.ok(portraitCriteria.filter(c => c.weight === 1).length === 1, "niceToHave весит 1")
  assert.ok(criteria.every(c => c.verdict === "not_checked"), "стартовый вердикт — не проверяли")
  assert.ok(criteria.every(c => c.label.length > 0), "у всех критериев есть подпись")
})

test("generateCriteriaFromSpec: null spec → только 3 универсальных", () => {
  const criteria = generateCriteriaFromSpec(null)
  assert.equal(criteria.length, 3)
  assert.ok(criteria.every(c => c.source === "universal"))
})
