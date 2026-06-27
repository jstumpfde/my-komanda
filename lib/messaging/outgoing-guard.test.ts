// Тесты финального стража исходящих сообщений (Юрий 27.06).
// Запуск: pnpm exec tsx --test lib/messaging/outgoing-guard.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { guardOutgoingMessage } from "./outgoing-guard"

test("корректное сообщение не трогается (no-op, safe)", () => {
  const src = "Иван, напоминаю про обзор по «Маркетолог» — посмотрите: https://company24.pro/demo/abc"
  const g = guardOutgoingMessage(src)
  assert.equal(g.text, src)
  assert.equal(g.issues.length, 0)
  assert.equal(g.safe, true)
})

test("неподставленная переменная {{step_noun}} вырезается + фиксируется в issues", () => {
  const g = guardOutgoingMessage("Иван, посмотрите {{step_noun}} здесь: x")
  assert.ok(!g.text.includes("{{"))
  assert.ok(g.issues.some(i => i.includes("unresolved_placeholders")))
  assert.equal(g.safe, true)
})

test("пустое имя: «Здравствуйте, !» → «Здравствуйте!»", () => {
  const g = guardOutgoingMessage("Здравствуйте, ! Посмотрите демо.")
  assert.ok(g.text.startsWith("Здравствуйте!"))
  assert.ok(!g.text.includes(", !"))
})

test("ведущая запятая (пустое имя в начале) убирается", () => {
  const g = guardOutgoingMessage(", приветствую! Вот ссылка: x")
  assert.ok(g.text.startsWith("приветствую"))
})

test("пустые «ёлочки» от невставленной {{vacancy}} убираются", () => {
  const g = guardOutgoingMessage("Спасибо за отклик на «» — посмотрите.")
  assert.ok(!g.text.includes("«»"))
})

test("висячее «:» в конце (ссылка не подставилась) убирается", () => {
  const g = guardOutgoingMessage("Иван, посмотрите демо:")
  assert.ok(!/[: ]$/.test(g.text))
  assert.ok(g.text.endsWith("демо"))
})

test("двойные пробелы и пробел перед пунктуацией схлопываются", () => {
  const g = guardOutgoingMessage("Иван ,  посмотрите   демо .")
  assert.ok(!g.text.includes("  "))
  assert.ok(!g.text.includes(" ,"))
  assert.ok(!g.text.includes(" ."))
})

test("сообщение пустое после чистки → safe=false (отправлять нельзя)", () => {
  const g = guardOutgoingMessage("{{step_noun}}")
  assert.equal(g.safe, false)
  assert.ok(g.issues.includes("empty_after_clean"))
})

test("null/undefined → safe=false, не падает", () => {
  assert.equal(guardOutgoingMessage(null).safe, false)
  assert.equal(guardOutgoingMessage(undefined).safe, false)
})
