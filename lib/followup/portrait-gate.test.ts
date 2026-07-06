// Юнит-тесты гейта «не дожимать кандидатов с Портретом ниже N» (drizzle/0259).
// Инцидент 06.07.2026: дожим слал «ваш опыт нам подходит» кандидату с
// Портрет-баллом 0. Запуск: pnpm exec tsx --test lib/followup/portrait-gate.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { decidePortraitGate, type PortraitGateCampaign } from "./portrait-gate"

const ENABLED_30: PortraitGateCampaign = { minPortraitScoreEnabled: true, minPortraitScore: 30 }
const DISABLED: PortraitGateCampaign = { minPortraitScoreEnabled: false, minPortraitScore: 30 }

test("выключенная настройка (дефолт) → поведение байт-в-байт как раньше, никогда не скипает", () => {
  // Легаси-инвариант: даже с баллом 0 и isDozhimTouch=true — выключенный
  // гейт не должен ничего трогать.
  assert.deepEqual(decidePortraitGate(DISABLED, true, 0), { skip: false })
  assert.deepEqual(decidePortraitGate(DISABLED, true, 100), { skip: false })
  assert.deepEqual(decidePortraitGate(DISABLED, true, null), { skip: false })
})

test("сценарий Ильина: включённый гейт, Портрет=0, порог=30 → skip", () => {
  const decision = decidePortraitGate(ENABLED_30, true, 0)
  assert.deepEqual(decision, { skip: true, reason: "low_portrait_score" })
})

test("включённый гейт, балл РОВНО на пороге → НЕ скип (строго меньше порога)", () => {
  assert.deepEqual(decidePortraitGate(ENABLED_30, true, 30), { skip: false })
})

test("включённый гейт, балл выше порога → НЕ скип", () => {
  assert.deepEqual(decidePortraitGate(ENABLED_30, true, 45), { skip: false })
})

test("включённый гейт, балл на 1 меньше порога → skip", () => {
  assert.deepEqual(decidePortraitGate(ENABLED_30, true, 29), { skip: true, reason: "low_portrait_score" })
})

test("включённый гейт, но НЕ дожимное касание (isDozhimTouch=false) → НЕ скип", () => {
  // Одноразовые транзакционные сообщения (приглашения/тест-инвайты) гейт не касается.
  assert.deepEqual(decidePortraitGate(ENABLED_30, false, 0), { skip: false })
})

test("включённый гейт, кандидат ещё не оценён (resumeScore=null/undefined) → НЕ скип", () => {
  // Нет данных для сравнения — ведём себя как раньше, не блокируем.
  assert.deepEqual(decidePortraitGate(ENABLED_30, true, null), { skip: false })
  assert.deepEqual(decidePortraitGate(ENABLED_30, true, undefined), { skip: false })
})

test("включённый гейт без явного порога в БД (undefined) → дефолт 30", () => {
  const campaign: PortraitGateCampaign = { minPortraitScoreEnabled: true, minPortraitScore: undefined }
  assert.deepEqual(decidePortraitGate(campaign, true, 10), { skip: true, reason: "low_portrait_score" })
  assert.deepEqual(decidePortraitGate(campaign, true, 30), { skip: false })
})
