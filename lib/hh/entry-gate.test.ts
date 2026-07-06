// Юнит-тесты входного гейта «Портрета» (Юрий 06.07, инцидент вакансия 6916 +
// дополнение: три сценария rejectAction вместо тумблера autoRejectEnabled).
// Запуск: pnpm exec tsx --test lib/hh/entry-gate.test.ts
//
// Тестируем ЧИСТУЮ функцию decideEntryGate (без БД):
//   1. score < lowerThreshold, rejectAction="pending_rejection" → reject.
//   2. score < lowerThreshold, rejectAction="pending_manual" → pending_manual.
//   3. score >= lowerThreshold, пороги заданы → send.
//   4. score === null (ещё не посчитан) → wait, даже если пороги заданы.
//   5. пороги НЕ заданы (enabled=false / rejectAction="none" / lowerThreshold<=0
//      / thresholds отсутствуют вовсе) → send (легаси байт-в-байт), независимо от score.
//   6. isEntryGateConfigured — граничные случаи маркера «заданы».

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decideEntryGate,
  isEntryGateConfigured,
  PORTRAIT_BELOW_THRESHOLD_REASON,
  type EntryGateThresholds,
} from "./entry-gate"

const CONFIGURED: EntryGateThresholds = {
  enabled:      true,
  rejectAction: "pending_rejection",
  lowerThreshold: 40,
}

const CONFIGURED_MANUAL: EntryGateThresholds = {
  ...CONFIGURED,
  rejectAction: "pending_manual",
}

// ─────────────────────────────────────────────────────────────────────────────
// decideEntryGate — rejectAction="pending_rejection" (легаси autoRejectEnabled=true)
// ─────────────────────────────────────────────────────────────────────────────

test("decideEntryGate: score < lowerThreshold, rejectAction=pending_rejection → reject", () => {
  const result = decideEntryGate(0, CONFIGURED)
  assert.deepEqual(result, { action: "reject", score: 0, threshold: 40 })
})

test("decideEntryGate: score чуть ниже порога → reject", () => {
  const result = decideEntryGate(39, CONFIGURED)
  assert.deepEqual(result, { action: "reject", score: 39, threshold: 40 })
})

test("decideEntryGate: score === lowerThreshold (граница) → send, НЕ reject", () => {
  const result = decideEntryGate(40, CONFIGURED)
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: score >= lowerThreshold, пороги заданы → send", () => {
  const result = decideEntryGate(65, CONFIGURED)
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: score высокий (100) → send", () => {
  const result = decideEntryGate(100, CONFIGURED)
  assert.deepEqual(result, { action: "send" })
})

// ─────────────────────────────────────────────────────────────────────────────
// decideEntryGate — rejectAction="pending_manual" (новый сценарий 06.07)
// ─────────────────────────────────────────────────────────────────────────────

test("decideEntryGate: score < lowerThreshold, rejectAction=pending_manual → pending_manual (не reject)", () => {
  const result = decideEntryGate(0, CONFIGURED_MANUAL)
  assert.deepEqual(result, { action: "pending_manual", score: 0, threshold: 40 })
})

test("decideEntryGate: pending_manual, score чуть ниже порога → pending_manual", () => {
  const result = decideEntryGate(39, CONFIGURED_MANUAL)
  assert.deepEqual(result, { action: "pending_manual", score: 39, threshold: 40 })
})

test("decideEntryGate: pending_manual, score >= lowerThreshold → send", () => {
  const result = decideEntryGate(40, CONFIGURED_MANUAL)
  assert.deepEqual(result, { action: "send" })
})

// ─────────────────────────────────────────────────────────────────────────────
// decideEntryGate — score IS NULL (не посчитан / AI упал)
// ─────────────────────────────────────────────────────────────────────────────

test("decideEntryGate: score === null, пороги заданы → wait (не отказ, не отправка)", () => {
  const result = decideEntryGate(null, CONFIGURED)
  assert.deepEqual(result, { action: "wait" })
})

test("decideEntryGate: score === undefined, пороги заданы → wait", () => {
  const result = decideEntryGate(undefined, CONFIGURED)
  assert.deepEqual(result, { action: "wait" })
})

test("decideEntryGate: score === null, rejectAction=pending_manual → wait", () => {
  const result = decideEntryGate(null, CONFIGURED_MANUAL)
  assert.deepEqual(result, { action: "wait" })
})

// ─────────────────────────────────────────────────────────────────────────────
// decideEntryGate — пороги НЕ заданы → легаси-поведение (send), независимо от score
// ─────────────────────────────────────────────────────────────────────────────

test("decideEntryGate: thresholds === null (Spec нет вовсе) → send даже при score=0", () => {
  const result = decideEntryGate(0, null)
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: thresholds === undefined → send даже при score=0", () => {
  const result = decideEntryGate(0, undefined)
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: enabled=false (блок порогов выключен) → send при score=0", () => {
  const result = decideEntryGate(0, { ...CONFIGURED, enabled: false })
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: rejectAction=none (зона отказа не включена HR) → send при score=0", () => {
  const result = decideEntryGate(0, { ...CONFIGURED, rejectAction: "none" })
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: lowerThreshold=0 (порог не выставлен) → send при score=0", () => {
  const result = decideEntryGate(0, { ...CONFIGURED, lowerThreshold: 0 })
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: lowerThreshold отрицательный (защита от мусора) → send", () => {
  const result = decideEntryGate(0, { ...CONFIGURED, lowerThreshold: -5 })
  assert.deepEqual(result, { action: "send" })
})

test("decideEntryGate: пороги не заданы + score===null → send (легаси, не wait)", () => {
  const result = decideEntryGate(null, null)
  assert.deepEqual(result, { action: "send" })
})

// ─────────────────────────────────────────────────────────────────────────────
// isEntryGateConfigured — граничные случаи маркера «заданы»
// ─────────────────────────────────────────────────────────────────────────────

test("isEntryGateConfigured: все условия выполнены (pending_rejection) → true", () => {
  assert.equal(isEntryGateConfigured(CONFIGURED), true)
})

test("isEntryGateConfigured: все условия выполнены (pending_manual) → true", () => {
  assert.equal(isEntryGateConfigured(CONFIGURED_MANUAL), true)
})

test("isEntryGateConfigured: null/undefined → false", () => {
  assert.equal(isEntryGateConfigured(null), false)
  assert.equal(isEntryGateConfigured(undefined), false)
})

test("isEntryGateConfigured: enabled=false → false", () => {
  assert.equal(isEntryGateConfigured({ ...CONFIGURED, enabled: false }), false)
})

test("isEntryGateConfigured: rejectAction=none → false", () => {
  assert.equal(isEntryGateConfigured({ ...CONFIGURED, rejectAction: "none" }), false)
})

test("isEntryGateConfigured: lowerThreshold=0 → false", () => {
  assert.equal(isEntryGateConfigured({ ...CONFIGURED, lowerThreshold: 0 }), false)
})

test("PORTRAIT_BELOW_THRESHOLD_REASON — стабильная строка-константа (используется в БД/бейджах)", () => {
  assert.equal(PORTRAIT_BELOW_THRESHOLD_REASON, "portrait_below_threshold")
})
