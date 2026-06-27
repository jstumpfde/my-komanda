// Юнит-тесты «человеческой» задержки первого сообщения (платформенный дефолт 5 мин,
// применяется ко всем вакансиям; старые истекли и не шлют — Юрий 26.06).
// Запуск: pnpm exec tsx --test lib/messaging/first-message-delay.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { firstMessageDelaySeconds, shouldDeferFirstMessage } from "./first-messages-chain"

const NOW = new Date("2026-06-27T12:00:00Z")
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000)

test("дефолт задержки = 300 сек, когда цепочка пустая/без delaySeconds", () => {
  assert.equal(firstMessageDelaySeconds([]), 300)
  assert.equal(firstMessageDelaySeconds(null), 300)
  assert.equal(firstMessageDelaySeconds([{ enabled: true, text: "x" }]), 300)
})

test("своя задержка вакансии из firstMessagesChain[0].delaySeconds", () => {
  assert.equal(firstMessageDelaySeconds([{ enabled: true, delaySeconds: 120, text: "x" }]), 120)
  assert.equal(firstMessageDelaySeconds([{ enabled: true, delaySeconds: 0, text: "x" }]), 0)
})

test("свежий отклик (возраст < задержки) → отложить", () => {
  assert.equal(shouldDeferFirstMessage(ago(60), [], NOW), true)        // 60с < 300с дефолт
})

test("старый отклик (возраст ≥ задержки) → обрабатывать сразу", () => {
  assert.equal(shouldDeferFirstMessage(ago(600), [], NOW), false)      // 600с > 300с
})

test("задержка 0 (отключена на вакансии) → никогда не откладываем", () => {
  assert.equal(shouldDeferFirstMessage(ago(1), [{ enabled: true, delaySeconds: 0, text: "x" }], NOW), false)
})

test("своя задержка 600с: возраст 400с → отложить, 700с → сразу", () => {
  const chain = [{ enabled: true, delaySeconds: 600, text: "x" }]
  assert.equal(shouldDeferFirstMessage(ago(400), chain, NOW), true)
  assert.equal(shouldDeferFirstMessage(ago(700), chain, NOW), false)
})

test("нет createdAt → не откладываем (обрабатываем)", () => {
  assert.equal(shouldDeferFirstMessage(null, [], NOW), false)
  assert.equal(shouldDeferFirstMessage(undefined, [], NOW), false)
})

test("createdAt строкой (ISO) тоже работает", () => {
  assert.equal(shouldDeferFirstMessage(ago(60).toISOString(), [], NOW), true)
})
