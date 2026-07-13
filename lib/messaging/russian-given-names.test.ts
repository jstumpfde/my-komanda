// Юнит-тесты looksLikeSurname (анти-фамилия для майнинга learned_given_names).
// Запуск: pnpm exec tsx --test lib/messaging/russian-given-names.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { looksLikeSurname, isKnownGivenName, looksLikePatronymic } from "./russian-given-names"

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

// ── looksLikePatronymic (13.07 — якорь для candidate-name.ts) ──────────────

test("мужские отчества по суффиксу распознаются", () => {
  assert.equal(looksLikePatronymic("Петрович"), true)
  assert.equal(looksLikePatronymic("Юрьевич"), true)
  assert.equal(looksLikePatronymic("Ильич"), true)
  assert.equal(looksLikePatronymic("Кузьмич"), true)
  assert.equal(looksLikePatronymic("Иванович"), true)
})

test("женские отчества по суффиксу распознаются", () => {
  assert.equal(looksLikePatronymic("Владимировна"), true)
  assert.equal(looksLikePatronymic("Юрьевна"), true)
  assert.equal(looksLikePatronymic("Ильинична"), true)
  assert.equal(looksLikePatronymic("Кузьминична"), true)
  assert.equal(looksLikePatronymic("Фоминична"), true)
})

test("известные фамилии-омонимы на -ович/-евич/-ич НЕ считаются отчеством", () => {
  assert.equal(looksLikePatronymic("Джокович"), false)
  assert.equal(looksLikePatronymic("Обренович"), false)
  assert.equal(looksLikePatronymic("Карагеоргиевич"), false)
  assert.equal(looksLikePatronymic("Видич"), false)
  assert.equal(looksLikePatronymic("Янкович"), false)
})

test("обычные имена/фамилии без отчественного суффикса → false", () => {
  assert.equal(looksLikePatronymic("Александр"), false)
  assert.equal(looksLikePatronymic("Иванов"), false)
  assert.equal(looksLikePatronymic("Кузьма"), false) // само имя, не отчество
})

test("регистронезависимо и по ё/е", () => {
  assert.equal(looksLikePatronymic("ПЕТРОВИЧ"), true)
  assert.equal(looksLikePatronymic("петрович"), true)
})

test("пусто/null → false", () => {
  assert.equal(looksLikePatronymic(""), false)
  assert.equal(looksLikePatronymic(null), false)
  assert.equal(looksLikePatronymic(undefined), false)
})
