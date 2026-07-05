// Юнит-тесты extractComplexName. Используем node:test (встроенный в Node
// 20+), как lib/template-renderer.test.ts — без vitest/jest.
// Запуск: pnpm exec tsx --test lib/price-monitor/complex-name.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { extractComplexName } from "./complex-name"

test("'Sea view Apartments by Mida Grande 4+*' → 'Mida Grande'", () => {
  assert.equal(extractComplexName("Sea view Apartments by Mida Grande 4+*"), "Mida Grande")
})

test("'Apartments by Mida Grand, Pool View' → 'Mida Grand'", () => {
  assert.equal(extractComplexName("Apartments by Mida Grand, Pool View"), "Mida Grand")
})

test("'1br Sea view Delux Apartment' → null (нет маркера комплекса)", () => {
  assert.equal(extractComplexName("1br Sea view Delux Apartment"), null)
})

test("null/undefined → null", () => {
  assert.equal(extractComplexName(null), null)
  assert.equal(extractComplexName(undefined), null)
})

test("'' (пусто) → null", () => {
  assert.equal(extractComplexName(""), null)
})

test("'Studio in Kata Beach Resort' → 'Kata Beach Resort'", () => {
  assert.equal(extractComplexName("Studio in Kata Beach Resort"), "Kata Beach Resort")
})
