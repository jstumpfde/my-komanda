// Юнит-тесты условия триггера «горячий кандидат стынет» (05.07).
// Запуск: pnpm exec tsx --test lib/demo/hot-candidate-trigger.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { shouldSendHotCandidateAlert, type HotCandidateTriggerInput } from "./hot-candidate-trigger"

const NOW = new Date("2026-07-05T12:00:00Z")
const FOUR_HOURS_AGO = new Date("2026-07-05T08:00:00Z")   // 4ч назад — старше порога 3ч
const ONE_HOUR_AGO = new Date("2026-07-05T11:00:00Z")     // 1ч назад — младше порога 3ч

function baseInput(overrides: Partial<HotCandidateTriggerInput> = {}): HotCandidateTriggerInput {
  return {
    resumeScore: 80,
    threshold: 70,
    demoOpenedAt: FOUR_HOURS_AGO,
    staleAfterHours: 3,
    demoProgressJson: { blocks: [] },
    anketaAnswers: null,
    now: NOW,
    ...overrides,
  }
}

test("все условия выполнены — алерт нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput()), true)
})

test("балл ниже порога — алерт не нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ resumeScore: 65 })), false)
})

test("балл ровно на пороге — алерт нужен (>=)", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ resumeScore: 70, threshold: 70 })), true)
})

test("балл не проставлен (null) — алерт не нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ resumeScore: null })), false)
})

test("демо не открывалось (demoOpenedAt null) — алерт не нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoOpenedAt: null })), false)
})

test("демо открыто недавно (младше staleAfterHours) — алерт не нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoOpenedAt: ONE_HOUR_AGO })), false)
})

test("демо открыто ровно staleAfterHours назад — алерт нужен (>=)", () => {
  const exactly3h = new Date(NOW.getTime() - 3 * 60 * 60 * 1000)
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoOpenedAt: exactly3h, staleAfterHours: 3 })), true)
})

test("есть хотя бы 1 пройденный реальный блок — алерт не нужен", () => {
  const progress = { blocks: [{ blockId: "blk-1", status: "completed" }] }
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoProgressJson: progress })), false)
})

test("виртуальные маркеры (__anketa__/__thanks__/__complete__) не считаются реальными блоками", () => {
  const progress = {
    blocks: [
      { blockId: "__anketa__", status: "completed" },
      { blockId: "__thanks__", status: "completed" },
      { blockId: "__complete__", status: "completed" },
    ],
  }
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoProgressJson: progress })), true)
})

test("блок есть, но статус skipped (не completed) — не считается пройденным", () => {
  const progress = { blocks: [{ blockId: "blk-1", status: "skipped" }] }
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoProgressJson: progress })), true)
})

test("анкета уже заполнена (массив с ответами) — алерт не нужен", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ anketaAnswers: [{ blockId: "q1", answer: "x" }] })), false)
})

test("анкета — пустой массив — не считается заполненной", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ anketaAnswers: [] })), true)
})

test("алерт уже отправлялся (hotAlertSentAt задан) — не слать повторно", () => {
  const progress = { blocks: [], hotAlertSentAt: "2026-07-05T09:00:00.000Z" }
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoProgressJson: progress })), false)
})

test("demoProgressJson отсутствует (null) — не падает, трактуется как 0 блоков", () => {
  assert.equal(shouldSendHotCandidateAlert(baseInput({ demoProgressJson: null })), true)
})
