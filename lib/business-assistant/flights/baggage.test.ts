import { test } from "node:test"
import assert from "node:assert/strict"
import { formatBaggageLabel, mockBaggage, UNKNOWN_BAGGAGE, worstOfSegments } from "./baggage"

test("formatBaggageLabel: неизвестный багаж — «уточняйте по тарифу»", () => {
  assert.equal(formatBaggageLabel(UNKNOWN_BAGGAGE), "Багаж: уточняйте по тарифу")
})

test("formatBaggageLabel: без регистрируемого багажа", () => {
  const label = formatBaggageLabel({
    handLuggage: { pieces: 1, weightKg: 8 },
    checkedBaggage: null,
    unknown: false,
  })
  assert.ok(label.startsWith("Без багажа (только ручная кладь)"))
  assert.ok(label.includes("Ручная кладь: 1×8 кг"))
})

test("formatBaggageLabel: с багажом и подписью худшего сегмента", () => {
  const label = formatBaggageLabel({
    handLuggage: { pieces: 1, weightKg: 8 },
    checkedBaggage: { pieces: 1, weightKg: 23 },
    unknown: false,
    worstSegmentNote: "по худшему из перелётов маршрута",
  })
  assert.ok(label.includes("Багаж: 1×23 кг"))
  assert.ok(label.endsWith("(по худшему из перелётов маршрута)"))
})

test("mockBaggage: бизнес-класс всегда с багажом", () => {
  for (let i = 0; i < 20; i++) {
    const b = mockBaggage(`seed-${i}`, "business")
    assert.ok(b.checkedBaggage !== null)
    assert.equal(b.unknown, false)
  }
})

test("worstOfSegments: берёт минимальный вес из известных сегментов", () => {
  const worst = worstOfSegments([
    { handLuggage: { pieces: 1, weightKg: 10 }, checkedBaggage: { pieces: 1, weightKg: 32 }, unknown: false },
    { handLuggage: { pieces: 1, weightKg: 8 }, checkedBaggage: { pieces: 1, weightKg: 20 }, unknown: false },
  ])
  assert.equal(worst.checkedBaggage?.weightKg, 20)
  assert.equal(worst.handLuggage?.weightKg, 8)
  assert.equal(worst.worstSegmentNote, "по худшему из перелётов маршрута")
})

test("worstOfSegments: если хотя бы один сегмент без багажа — итог без багажа", () => {
  const worst = worstOfSegments([
    { handLuggage: { pieces: 1, weightKg: 10 }, checkedBaggage: { pieces: 1, weightKg: 32 }, unknown: false },
    { handLuggage: { pieces: 1, weightKg: 8 }, checkedBaggage: null, unknown: false },
  ])
  assert.equal(worst.checkedBaggage, null)
})

test("worstOfSegments: все сегменты неизвестны → результат неизвестен", () => {
  const worst = worstOfSegments([UNKNOWN_BAGGAGE, UNKNOWN_BAGGAGE])
  assert.equal(worst.unknown, true)
})
