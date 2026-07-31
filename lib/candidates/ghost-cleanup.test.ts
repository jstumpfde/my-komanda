// Юнит-тесты критерия "кандидат-призрак" (lib/candidates/ghost-cleanup.ts).
// Запуск: pnpm exec tsx --test lib/candidates/ghost-cleanup.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { isGhostCandidate, type GhostCandidateRow } from "./ghost-cleanup"

const NOW = new Date("2026-07-13T12:00:00.000Z")
const OLD = new Date("2026-07-12T00:00:00.000Z") // > 24ч до NOW
const FRESH = new Date("2026-07-13T11:30:00.000Z") // < 24ч до NOW

function baseGhost(overrides: Partial<GhostCandidateRow> = {}): GhostCandidateRow {
  return {
    name: "Новый кандидат",
    source: "referral",
    stage: "new",
    resumeScore: null,
    phone: null,
    email: null,
    demoProgressJson: null,
    createdAt: OLD,
    ...overrides,
  }
}

test("канонический призрак старше 24ч → true", () => {
  assert.equal(isGhostCandidate(baseGhost(), NOW), true)
})

test("hh-referral / telegram-referral / vk-referral тоже считаются призраком", () => {
  assert.equal(isGhostCandidate(baseGhost({ source: "hh-referral" }), NOW), true)
  assert.equal(isGhostCandidate(baseGhost({ source: "telegram-referral" }), NOW), true)
  assert.equal(isGhostCandidate(baseGhost({ source: "vk-referral" }), NOW), true)
})

test("demoProgressJson = {} или строка 'null'/'{}' — тоже пусто", () => {
  assert.equal(isGhostCandidate(baseGhost({ demoProgressJson: {} }), NOW), true)
  assert.equal(isGhostCandidate(baseGhost({ demoProgressJson: "null" }), NOW), true)
  assert.equal(isGhostCandidate(baseGhost({ demoProgressJson: "{}" }), NOW), true)
})

test("моложе 24ч → false (не трогаем, кандидат мог продолжить заполнение)", () => {
  assert.equal(isGhostCandidate(baseGhost({ createdAt: FRESH }), NOW), false)
})

test("другое имя → false (реальный кандидат)", () => {
  assert.equal(isGhostCandidate(baseGhost({ name: "Иван Иванов" }), NOW), false)
})

test("source без 'referral' → false", () => {
  assert.equal(isGhostCandidate(baseGhost({ source: "hh" }), NOW), false)
  assert.equal(isGhostCandidate(baseGhost({ source: null }), NOW), false)
  assert.equal(isGhostCandidate(baseGhost({ source: "preview" }), NOW), false)
})

test("stage не 'new' → false (кандидат продвинулся по воронке)", () => {
  assert.equal(isGhostCandidate(baseGhost({ stage: "demo_opened" }), NOW), false)
})

test("есть телефон/email/resumeScore/непустой demoProgressJson → false", () => {
  assert.equal(isGhostCandidate(baseGhost({ phone: "+79990000000" }), NOW), false)
  assert.equal(isGhostCandidate(baseGhost({ email: "a@b.ru" }), NOW), false)
  assert.equal(isGhostCandidate(baseGhost({ resumeScore: 42 }), NOW), false)
  assert.equal(isGhostCandidate(baseGhost({ demoProgressJson: { step: 1 } }), NOW), false)
})

test("нет createdAt → false (не удаляем без гарантии возраста)", () => {
  assert.equal(isGhostCandidate(baseGhost({ createdAt: null }), NOW), false)
})
