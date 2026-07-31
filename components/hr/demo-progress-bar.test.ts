// Юнит-тест страховки-инварианта calcDemoFraction: числитель N НИКОГДА не
// превышает знаменатель M. Баг «32/20» / «19/17» возникал в клиентском
// фолбэке для блок-демо (несколько демо в одном demo_progress_json:
// completed-блоки суммируются по всем демо, а totalBlocks — скаляр одного).
// Основной фикс — override «наивысший демо» в API; это — страховка в UI.
// Запуск: pnpm exec tsx --test components/hr/demo-progress-bar.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { calcDemoFraction } from "./demo-progress-bar"

test("clamp: completed (32) > totalBlocks (20) → N клампится до M (20/20)", () => {
  const dp = {
    totalBlocks: 20,
    blocks: Array.from({ length: 32 }, (_, i) => ({ blockId: `b${i}`, status: "completed" })),
  }
  const f = calcDemoFraction(dp)
  assert.equal(f.total, 20)
  assert.equal(f.current, 20)
  assert.ok(f.current <= f.total, "N ≤ M инвариант")
})

test("clamp: completed (19) > totalBlocks (17) → 17/17", () => {
  const dp = {
    totalBlocks: 17,
    blocks: Array.from({ length: 19 }, (_, i) => ({ blockId: `b${i}`, status: "completed" })),
  }
  const f = calcDemoFraction(dp)
  assert.equal(f.current, 17)
  assert.equal(f.total, 17)
})

test("clamp: нормальный случай (completed < total) не меняется", () => {
  const dp = {
    totalBlocks: 16,
    blocks: [
      ...Array.from({ length: 4 }, (_, i) => ({ blockId: `b${i}`, status: "completed" })),
      { blockId: "b5", status: "in_progress" },
    ],
  }
  const f = calcDemoFraction(dp)
  assert.equal(f.current, 4)
  assert.equal(f.total, 16)
})

test("clamp: служебный __complete__ не считается в числитель", () => {
  const dp = {
    totalBlocks: 5,
    blocks: [
      { blockId: "__complete__", status: "completed" },
      { blockId: "a", status: "completed" },
    ],
  }
  const f = calcDemoFraction(dp)
  assert.equal(f.current, 1)
})

test("clamp: total=0 (неизвестный знаменатель) — не клампим (бар рисует %)", () => {
  const dp = {
    totalBlocks: 0,
    blocks: [
      { blockId: "a", status: "completed" },
      { blockId: "b", status: "completed" },
    ],
  }
  const f = calcDemoFraction(dp)
  assert.equal(f.total, 0)
  assert.equal(f.current, 2)
})

test("clamp: нет данных → current/total = 0, hasData=false", () => {
  assert.deepEqual(calcDemoFraction(null), { current: 0, total: 0, hasData: false })
  assert.deepEqual(calcDemoFraction(undefined), { current: 0, total: 0, hasData: false })
  assert.deepEqual(calcDemoFraction({}), { current: 0, total: 0, hasData: false })
})
