// Юнит-тесты решения «слать / пауза+эскалация / wants_contact / лог» по
// вердикту classifyCandidateResponse. Инцидент 06.07.2026 (Ильин, вакансия
// 6916): дожим хвалил кандидата, явно отказавшегося от требования вакансии.
// Запуск: pnpm exec tsx --test lib/followup/decline-signal.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { decideIncomingMessageAction, REJECTION_CONFIDENCE_THRESHOLD } from "./decline-signal"

test("rejection с уверенностью >= порога → auto_reject", () => {
  const action = decideIncomingMessageAction("rejection", 0.95)
  assert.deepEqual(action, { type: "auto_reject" })
})

test("rejection РОВНО на пороге (0.9) → auto_reject (граница включительно)", () => {
  const action = decideIncomingMessageAction("rejection", REJECTION_CONFIDENCE_THRESHOLD)
  assert.deepEqual(action, { type: "auto_reject" })
})

test("rejection ниже порога → пауза+эскалация (НЕ тихий no-op, инцидент 06.07)", () => {
  const action = decideIncomingMessageAction("rejection", 0.51)
  assert.deepEqual(action, { type: "pause_and_escalate", reason: "rejection_low_confidence_needs_review" })
})

test("decline_requirement — НИКОГДА auto_reject, независимо от уверенности", () => {
  for (const confidence of [0.1, 0.5, 0.9, 0.99, 1]) {
    const action = decideIncomingMessageAction("decline_requirement", confidence)
    assert.deepEqual(
      action,
      { type: "pause_and_escalate", reason: "decline_requirement_needs_review" },
      `confidence=${confidence} не должен приводить к auto_reject`,
    )
  }
})

test("сценарий Ильина: decline_requirement высокой уверенности → пауза, не отказ", () => {
  // «По холодным звонкам больше не собираюсь работать» — классификатор
  // должен вернуть decline_requirement (не rejection), и даже при высокой
  // уверенности это НЕ auto_reject.
  const action = decideIncomingMessageAction("decline_requirement", 0.92)
  assert.equal(action.type, "pause_and_escalate")
  assert.notEqual(action.type, "auto_reject")
})

test("wants_personal_contact → wants_contact, независимо от уверенности", () => {
  assert.deepEqual(decideIncomingMessageAction("wants_personal_contact", 0.3), { type: "wants_contact" })
  assert.deepEqual(decideIncomingMessageAction("wants_personal_contact", 0.99), { type: "wants_contact" })
})

test("busy_later / agreement / unclear → log_only (поведение не меняется)", () => {
  assert.deepEqual(decideIncomingMessageAction("busy_later", 0.8), { type: "log_only" })
  assert.deepEqual(decideIncomingMessageAction("agreement", 0.99), { type: "log_only" })
  assert.deepEqual(decideIncomingMessageAction("unclear", 0), { type: "log_only" })
})
