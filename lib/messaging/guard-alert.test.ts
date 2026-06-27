// Тесты логики алерта стража (per-company). Запуск:
// pnpm exec tsx --test lib/messaging/guard-alert.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { isSerious, withinThrottle } from "./guard-alert"

test("серьёзно: сырые переменные / пустое после чистки", () => {
  assert.equal(isSerious(["unresolved_placeholders: {{step_noun}}"]), true)
  assert.equal(isSerious(["empty_after_clean"]), true)
})

test("несерьёзно: косметика (исправленное приветствие)", () => {
  assert.equal(isSerious(["fixed_empty_name_greeting"]), false)
  assert.equal(isSerious([]), false)
})

test("троттл: меньше 5 мин с прошлого алерта → ещё рано", () => {
  const now = 1_000_000_000
  assert.equal(withinThrottle(now, now - 2 * 60_000), true)   // 2 мин назад → within throttle (рано)
})

test("троттл прошёл (>5 мин) → можно", () => {
  const now = 1_000_000_000
  assert.equal(withinThrottle(now, now - 6 * 60_000), false)  // 6 мин назад → пауза прошла
})
