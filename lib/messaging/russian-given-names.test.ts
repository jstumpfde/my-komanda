// Юнит-тесты looksLikeSurname (анти-фамилия для майнинга learned_given_names).
// Запуск: pnpm exec tsx --test lib/messaging/russian-given-names.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { looksLikeSurname, isKnownGivenName } from "./russian-given-names"

test("типичные фамильные суффиксы распознаются", () => {
  assert.equal(looksLikeSurname("Иванов"), true)
  assert.equal(looksLikeSurname("Иванова"), true)
  assert.equal(looksLikeSurname("Сергеев"), true)
  assert.equal(looksLikeSurname("Сергеева"), true)
  assert.equal(looksLikeSurname("Соловьёв"), true)
  assert.equal(looksLikeSurname("Соловьёва"), true)
  assert.equal(looksLikeSurname("Пушкин"), true)
  assert.equal(looksLikeSurname("Пушкина"), true)
  assert.equal(looksLikeSurname("Синицын"), true)
  assert.equal(looksLikeSurname("Синицына"), true)
  assert.equal(looksLikeSurname("Достоевский"), true)
  assert.equal(looksLikeSurname("Достоевская"), true)
  assert.equal(looksLikeSurname("Троцкий"), true)
  assert.equal(looksLikeSurname("Троцкая"), true)
  assert.equal(looksLikeSurname("Шевченко"), true)
  assert.equal(looksLikeSurname("Мельничук"), true)
  assert.equal(looksLikeSurname("Костюк"), true)
  assert.equal(looksLikeSurname("Швачук"), true)
  assert.equal(looksLikeSurname("Оганесян"), true)
  assert.equal(looksLikeSurname("Вардзелашвили"), true)
  assert.equal(looksLikeSurname("Тевздадзе"), true)
  assert.equal(looksLikeSurname("Гусейноглы"), true)
})

test("регистронезависимо", () => {
  assert.equal(looksLikeSurname("ИВАНОВ"), true)
  assert.equal(looksLikeSurname("иванова"), true)
})

test("обычные имена НЕ распознаются как фамилии", () => {
  assert.equal(looksLikeSurname("Александр"), false)
  assert.equal(looksLikeSurname("Мария"), false)
  assert.equal(looksLikeSurname("Елизаветта"), false) // выдуманное, но не фамильный суффикс
  assert.equal(looksLikeSurname("Тимур"), false)
})

test("пусто/null → false", () => {
  assert.equal(looksLikeSurname(""), false)
  assert.equal(looksLikeSurname(null), false)
  assert.equal(looksLikeSurname(undefined), false)
})

test("многословный токен — суффикс проверяется по первому слову", () => {
  assert.equal(looksLikeSurname("Иванов Сергей"), true)
  assert.equal(looksLikeSurname("Сергей Иванов"), false)
})

test("sanity: isKnownGivenName по-прежнему работает (регрессия импорта)", () => {
  assert.equal(isKnownGivenName("Сергей"), true)
  assert.equal(isKnownGivenName("Елизаветта"), false)
})
