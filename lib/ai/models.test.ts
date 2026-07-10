// Юнит-тесты computeCostUsd — расчёт стоимости AI-вызова по прайс-таблице
// (Юрий 05.07: «хочу точную сумму расходов AI»).
// Запуск: pnpm exec tsx --test lib/ai/models.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeCostUsd } from "./models"

test("claude-sonnet-5 — $2/$10 за MTok (промо-цена)", () => {
  // 1M input + 1M output → $2 + $10 = $12
  const cost = computeCostUsd("claude-sonnet-5", 1_000_000, 1_000_000)
  assert.equal(cost, 12)
})

test("claude-sonnet-5 — дробные токены считаются пропорционально", () => {
  // 500K input ($1) + 200K output ($2) = $3
  const cost = computeCostUsd("claude-sonnet-5", 500_000, 200_000)
  assert.ok(cost !== null)
  assert.ok(Math.abs(cost! - 3) < 1e-9)
})

test("claude-haiku-4-5 — $1/$5 за MTok", () => {
  const cost = computeCostUsd("claude-haiku-4-5", 1_000_000, 1_000_000)
  assert.equal(cost, 6)
})

test("claude-haiku-4-5-20251001 (строгое id с датой) — та же цена, что алиас", () => {
  const cost = computeCostUsd("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)
  assert.equal(cost, 6)
})

test("claude-sonnet-4-6 — $3/$15 за MTok", () => {
  const cost = computeCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000)
  assert.equal(cost, 18)
})

test("неизвестная модель → null (не выдумываем цену)", () => {
  assert.equal(computeCostUsd("some-future-model", 1000, 1000), null)
})

test("claude-opus-4-8 — $5/$25 за MTok (ревизия 10.07, точечные сложные задачи)", () => {
  assert.equal(computeCostUsd("claude-opus-4-8", 1_000_000, 1_000_000), 30)
})

test("claude-fable-5 — $10/$50 за MTok (только координация разработки)", () => {
  assert.equal(computeCostUsd("claude-fable-5", 1_000_000, 1_000_000), 60)
})

test("model отсутствует (null/undefined) → null", () => {
  assert.equal(computeCostUsd(null, 1000, 1000), null)
  assert.equal(computeCostUsd(undefined, 1000, 1000), null)
})

test("нулевые токены → 0, не null", () => {
  assert.equal(computeCostUsd("claude-sonnet-5", 0, 0), 0)
})

test("отсутствующие inputTokens/outputTokens трактуются как 0", () => {
  assert.equal(computeCostUsd("claude-sonnet-5", null, null), 0)
  assert.equal(computeCostUsd("claude-sonnet-5", undefined, undefined), 0)
})
