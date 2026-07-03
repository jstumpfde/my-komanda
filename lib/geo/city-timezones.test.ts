// lib/geo/city-timezones.test.ts
// Юнит-тесты резолвера город → UTC-оффсет (справочник lib/geo/city-timezones.ts).
// Запуск: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test lib/geo/city-timezones.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveCityUtcOffset } from "./city-timezones"

test("Москва → UTC+3", () => {
  assert.equal(resolveCityUtcOffset("Москва"), 3)
})

test("«Внуковское (Московская область)» → UTC+3 (регион в скобках)", () => {
  assert.equal(resolveCityUtcOffset("Внуковское (Московская область)"), 3)
})

test("Ташкент → UTC+5", () => {
  assert.equal(resolveCityUtcOffset("Ташкент"), 5)
})

test("Владивосток → UTC+10", () => {
  assert.equal(resolveCityUtcOffset("Владивосток"), 10)
})

test("Неизвестный город → null (fail-open)", () => {
  assert.equal(resolveCityUtcOffset("Неизвестный"), null)
})

test("Пустая строка / null / undefined → null", () => {
  assert.equal(resolveCityUtcOffset(""), null)
  assert.equal(resolveCityUtcOffset(null), null)
  assert.equal(resolveCityUtcOffset(undefined), null)
})

test("Калининград → UTC+2", () => {
  assert.equal(resolveCityUtcOffset("Калининград"), 2)
})

test("«г. Санкт-Петербург» → UTC+3 (префикс «г.» отбрасывается)", () => {
  assert.equal(resolveCityUtcOffset("г. Санкт-Петербург"), 3)
})

test("Минск → UTC+3, Алматы → UTC+5 (СНГ)", () => {
  assert.equal(resolveCityUtcOffset("Минск"), 3)
  assert.equal(resolveCityUtcOffset("Алматы"), 5)
})
