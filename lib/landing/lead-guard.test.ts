// Тесты анти-спам логики формы лендинга. Запуск:
// pnpm exec tsx --test lib/landing/lead-guard.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  isHoneypotTripped,
  isWithinLandingLeadRateLimit,
  LANDING_LEAD_RATE_LIMIT_MAX,
} from "./lead-guard"

test("honeypot: заполненное скрытое поле — бот", () => {
  assert.equal(isHoneypotTripped("http://spam.example"), true)
  assert.equal(isHoneypotTripped("  x  "), true)
})

test("honeypot: пусто/отсутствует — человек", () => {
  assert.equal(isHoneypotTripped(""), false)
  assert.equal(isHoneypotTripped("   "), false)
  assert.equal(isHoneypotTripped(undefined), false)
  assert.equal(isHoneypotTripped(null), false)
})

test("rate-limit: меньше лимита — разрешено", () => {
  assert.equal(isWithinLandingLeadRateLimit(0), true)
  assert.equal(isWithinLandingLeadRateLimit(LANDING_LEAD_RATE_LIMIT_MAX - 1), true)
})

test("rate-limit: лимит исчерпан — заблокировано", () => {
  assert.equal(isWithinLandingLeadRateLimit(LANDING_LEAD_RATE_LIMIT_MAX), false)
  assert.equal(isWithinLandingLeadRateLimit(LANDING_LEAD_RATE_LIMIT_MAX + 5), false)
})
