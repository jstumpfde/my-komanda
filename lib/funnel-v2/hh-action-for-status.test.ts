// Юнит-тесты маппинга STAGE_STATUSES → действие hh-воронки (решение Юрия 26.06).
// Запуск: pnpm exec tsx --test lib/funnel-v2/hh-action-for-status.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { hhActionForStatus, STAGE_STATUSES } from "./types"

test("отказ → discard (все варианты)", () => {
  assert.equal(hhActionForStatus("отказ"), "discard")
  assert.equal(hhActionForStatus("Кандидат отказался"), "discard")
  assert.equal(hhActionForStatus("ОТКАЗ"), "discard")
})

test("тестовое задание → assessment", () => {
  assert.equal(hhActionForStatus("тестовое задание"), "assessment")
  assert.equal(hhActionForStatus("Тест"), "assessment")
})

test("интервью → interview", () => {
  assert.equal(hhActionForStatus("интервью"), "interview")
  assert.equal(hhActionForStatus("Интервью"), "interview")
})

test("первичный контакт → invitation", () => {
  assert.equal(hhActionForStatus("первичный контакт"), "invitation")
})

test("новый / оффер / принят → null (не менять стадию на hh)", () => {
  assert.equal(hhActionForStatus("новый"), null)
  assert.equal(hhActionForStatus("оффер"), null)
  assert.equal(hhActionForStatus("принят"), null)
})

test("пусто / undefined / null → null", () => {
  assert.equal(hhActionForStatus(""), null)
  assert.equal(hhActionForStatus(undefined), null)
  assert.equal(hhActionForStatus(null), null)
})

test("приоритет: отказ важнее теста/интервью, если оба слова встречаются", () => {
  // «отказ после интервью» — это отказ.
  assert.equal(hhActionForStatus("отказ после интервью"), "discard")
})

test("все STAGE_STATUSES мапятся без исключений (валидное значение или null)", () => {
  const valid = new Set(["invitation", "assessment", "interview", "discard", null])
  for (const s of STAGE_STATUSES) {
    assert.ok(valid.has(hhActionForStatus(s) as never), `неожиданный маппинг для «${s}»`)
  }
})
