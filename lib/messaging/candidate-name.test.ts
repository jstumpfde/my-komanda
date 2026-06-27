// Юнит-тесты резолвера имени кандидата (подстановка {{name}} + бэйдж «имя под вопросом»).
// Запуск: pnpm exec tsx --test lib/messaging/candidate-name.test.ts
//
// Покрываем кейсы Юрия: фамилия вместо имени, перепутанные поля hh, аноним/нет имени.
// confident=false → бот шлёт нейтральное «Здравствуйте» И на карточке бэйдж «⚠ имя».

import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveGivenNameMeta } from "./candidate-name"

test("формат «Фамилия Имя» → берём имя (2-е слово), confident", () => {
  const m = resolveGivenNameMeta({ fullName: "Петренко Александр" })
  assert.equal(m.firstName, "Александр")
  assert.equal(m.confident, true)
})

test("перепутанные поля hh (фамилия в «Имя», имя в «Фамилию») → находит имя, confident", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Макаренко", hhLast: "Сергей" })
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.confident, true)
  assert.equal(m.source, "hh_last_swap")
})

test("ручная правка HR (override) → confident, она в приоритете", () => {
  const m = resolveGivenNameMeta({ override: "Иван", fullName: "Петренко Александр" })
  assert.equal(m.firstName, "Иван")
  assert.equal(m.confident, true)
  assert.equal(m.source, "override")
})

test("аноним → нейтральное «Здравствуйте», НЕ confident (бэйдж покажется)", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Анонимный соискатель", fullName: "Аноним" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("нет имени / пусто → нейтральное, НЕ confident", () => {
  const m = resolveGivenNameMeta({ fullName: "" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("одно слово (вероятно фамилия) → нейтральное, НЕ confident (не угадываем)", () => {
  const m = resolveGivenNameMeta({ fullName: "Петренко" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("редкое/нерусское имя не из словаря → берём hh first_name, но НЕ confident (HR проверит)", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Зейнаб" })
  assert.equal(m.firstName, "Зейнаб")
  assert.equal(m.confident, false)
  assert.equal(m.source, "hh_first_raw")
})

test("заглушка бэкфилла «Кандидат с hh.ru» → нейтральное, НЕ confident", () => {
  const m = resolveGivenNameMeta({ fullName: "Кандидат с hh.ru" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})
