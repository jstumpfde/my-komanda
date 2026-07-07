// Юнит-тесты расчёта медианы/вилки зарплат по реальным salary-объектам hh
// (lib/hh/market-stats.ts). Запуск: pnpm exec tsx --test lib/hh/market-stats.test.ts
//
// Проверяем:
//   1. Полные from/to → берём середину вилки, медиана по нечётной/чётной выборке.
//   2. Частичные (только from или только to) → берём то, что есть.
//   3. Нулевые/null salary (не указана) → выбрасываем из выборки, sampleSize падает.
//   4. USD/EUR и прочая валюта — отбрасываем как несопоставимую.
//   5. Пустая выборка → все null, sampleSize=0.
//   6. formatHhSalary — человеческий формат для разных комбинаций.

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeMarketSalaryStats, formatHhSalary } from "./market-stats"

test("computeMarketSalaryStats: полные вилки, нечётная выборка → корректная медиана", () => {
  const result = computeMarketSalaryStats([
    { from: 100000, to: 150000, currency: "RUR" }, // rep 125000
    { from: 80000, to: 120000, currency: "RUR" },  // rep 100000
    { from: 150000, to: 200000, currency: "RUR" }, // rep 175000
  ])
  assert.equal(result.sampleSize, 3)
  assert.equal(result.salaryMedian, 125000)
  assert.equal(result.salaryFrom, 80000)
  assert.equal(result.salaryTo, 200000)
})

test("computeMarketSalaryStats: чётная выборка → медиана как среднее двух средних", () => {
  const result = computeMarketSalaryStats([
    { from: 100000, to: 100000, currency: "RUR" },
    { from: 200000, to: 200000, currency: "RUR" },
  ])
  assert.equal(result.sampleSize, 2)
  assert.equal(result.salaryMedian, 150000)
})

test("computeMarketSalaryStats: только from или только to — берём то, что есть", () => {
  const result = computeMarketSalaryStats([
    { from: 90000, to: null, currency: "RUR" },
    { from: null, to: 130000, currency: "RUR" },
  ])
  assert.equal(result.sampleSize, 2)
  assert.equal(result.salaryFrom, 90000)
  assert.equal(result.salaryTo, 130000)
  // медиана двух значений 90000 и 130000
  assert.equal(result.salaryMedian, 110000)
})

test("computeMarketSalaryStats: null/undefined/нулевые salary выбрасываются из выборки", () => {
  const result = computeMarketSalaryStats([
    null,
    undefined,
    { from: 0, to: 0, currency: "RUR" },
    { from: null, to: null, currency: "RUR" },
    { from: 100000, to: 100000, currency: "RUR" },
  ])
  assert.equal(result.sampleSize, 1)
  assert.equal(result.salaryMedian, 100000)
})

test("computeMarketSalaryStats: не-RUR валюта отбрасывается", () => {
  const result = computeMarketSalaryStats([
    { from: 5000, to: 8000, currency: "USD" },
    { from: 3000, to: 4000, currency: "EUR" },
    { from: 100000, to: 150000, currency: "RUR" },
  ])
  assert.equal(result.sampleSize, 1)
  assert.equal(result.salaryMedian, 125000)
})

test("computeMarketSalaryStats: пустая выборка → всё null, sampleSize=0", () => {
  const result = computeMarketSalaryStats([])
  assert.equal(result.sampleSize, 0)
  assert.equal(result.salaryMedian, null)
  assert.equal(result.salaryFrom, null)
  assert.equal(result.salaryTo, null)
})

// hh.toLocaleString("ru-RU") использует локаль-специфичный разделитель разрядов
// (в ICU Node это узкий неразрывный пробел  , не обычный пробел) — строим
// ожидаемые строки через тот же toLocaleString, а не хардкодим байты пробела.
const fmt = (n: number) => n.toLocaleString("ru-RU")

test("formatHhSalary: полная вилка", () => {
  assert.equal(formatHhSalary({ from: 100000, to: 150000, currency: "RUR" }), `${fmt(100000)} – ${fmt(150000)} ₽`)
})

test("formatHhSalary: только от", () => {
  assert.equal(formatHhSalary({ from: 100000, to: null, currency: "RUR" }), `от ${fmt(100000)} ₽`)
})

test("formatHhSalary: только до, gross", () => {
  assert.equal(formatHhSalary({ from: null, to: 150000, currency: "RUR", gross: true }), `до ${fmt(150000)} ₽ (до вычета налога)`)
})

test("formatHhSalary: не указана", () => {
  assert.equal(formatHhSalary(null), "Не указана")
  assert.equal(formatHhSalary({ from: null, to: null, currency: "RUR" }), "Не указана")
})

test("formatHhSalary: иностранная валюта показывает код валюты", () => {
  assert.equal(formatHhSalary({ from: 1000, to: 2000, currency: "USD" }), `${fmt(1000)} – ${fmt(2000)} USD`)
})
