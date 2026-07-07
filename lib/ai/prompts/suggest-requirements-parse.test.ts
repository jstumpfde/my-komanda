// Тесты чистых функций разбора ответа AI на buildSuggestRequirementsPrompt
// (эталонный дефолт 07.07.2026: nice_to_have приходит с весами оси, Σ≈100).

import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanArray, cleanWeightedArray } from "./suggest-requirements-parse"

test("cleanWeightedArray: принимает объекты {text, weight} как есть", () => {
  const out = cleanWeightedArray([
    { text: "Продажи, B2B, тендеры", weight: 40 },
    { text: "Переговоры, работа с возражениями", weight: 35 },
    { text: "Результат, цифры по выручке", weight: 25 },
  ], 5)
  assert.equal(out.length, 3)
  assert.deepEqual(out.map(o => o.weight), [40, 35, 25])
  assert.equal(out.reduce((s, o) => s + o.weight, 0), 100)
})

test("cleanWeightedArray: клампит вес в [0,100] и округляет", () => {
  const out = cleanWeightedArray([
    { text: "A", weight: 150 },
    { text: "B", weight: -10 },
    { text: "C", weight: 33.6 },
  ], 5)
  // A клампится к 100, B к 0 (→ пойдёт в «нет веса» и получит долю остатка),
  // C округляется до 34.
  const a = out.find(o => o.text === "A")!
  const c = out.find(o => o.text === "C")!
  assert.equal(a.weight, 100)
  assert.equal(c.weight, 34)
})

test("cleanWeightedArray: строки (legacy-формат) — равная доля остатка = 100/N", () => {
  const out = cleanWeightedArray(["Тексты", "Визуал", "Видео", "Продажи"], 5)
  assert.equal(out.length, 4)
  assert.deepEqual(out.map(o => o.text), ["Тексты", "Визуал", "Видео", "Продажи"])
  // 100/4 = 25 ровно — все равны.
  assert.deepEqual(out.map(o => o.weight), [25, 25, 25, 25])
  assert.equal(out.reduce((s, o) => s + o.weight, 0), 100)
})

test("cleanWeightedArray: смешанный ввод — заданные веса сохраняются, остаток делится поровну между пунктами без веса (+1 первым при неровном остатке)", () => {
  const out = cleanWeightedArray([
    { text: "Ключевое", weight: 50 },
    { text: "Без веса 1" },
    { text: "Без веса 2" },
    { text: "Без веса 3" },
  ], 5)
  const keyed = new Map(out.map(o => [o.text, o.weight]))
  assert.equal(keyed.get("Ключевое"), 50)
  // Остаток 50 на 3 пункта: base=16, rem=2 → первые два получают +1 (17,17,16).
  assert.equal(keyed.get("Без веса 1"), 17)
  assert.equal(keyed.get("Без веса 2"), 17)
  assert.equal(keyed.get("Без веса 3"), 16)
  assert.equal(out.reduce((s, o) => s + o.weight, 0), 100)
})

test("cleanWeightedArray: если сумма явных весов уже ≥100, у пунктов без веса бюджет 0", () => {
  const out = cleanWeightedArray([
    { text: "Большой", weight: 90 },
    { text: "Ещё большой", weight: 40 },
    { text: "Без веса" },
  ], 5)
  const keyed = new Map(out.map(o => [o.text, o.weight]))
  assert.equal(keyed.get("Большой"), 90)
  assert.equal(keyed.get("Ещё большой"), 40)
  assert.equal(keyed.get("Без веса"), 0)
})

test("cleanWeightedArray: отбрасывает пустые/слишком длинные, уважает maxItems", () => {
  const out = cleanWeightedArray([
    { text: "  ", weight: 10 },
    { text: "ok", weight: 10 },
    { text: "x".repeat(300), weight: 10 },
    { text: "ok2", weight: 10 },
    { text: "ok3", weight: 10 },
  ], 2)
  assert.equal(out.length, 2)
  assert.deepEqual(out.map(o => o.text), ["ok", "ok2"])
})

test("cleanWeightedArray: не массив → пустой результат", () => {
  assert.deepEqual(cleanWeightedArray(null, 5), [])
  assert.deepEqual(cleanWeightedArray(undefined, 5), [])
  assert.deepEqual(cleanWeightedArray("не массив", 5), [])
})

test("cleanArray: trim, отброс пустых/слишком длинных, лимит", () => {
  const out = cleanArray(["  a  ", "", "b", "x".repeat(300), "c", "d"], 3)
  assert.deepEqual(out, ["a", "b", "c"])
})
