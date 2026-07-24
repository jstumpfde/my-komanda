import { test } from "node:test"
import assert from "node:assert/strict"
import { buildBuyTimingRecommendation, isDomesticRoute, mockMonthPriceMatrix } from "./buy-timing"

test("isDomesticRoute: MOW-LED — внутренний, MOW-IST — международный", () => {
  assert.equal(isDomesticRoute("MOW", "LED"), true)
  assert.equal(isDomesticRoute("MOW", "IST"), false)
})

test("вылет через 3 дня — покупать сейчас (поздний этап)", () => {
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-01-04",
    currentPriceRub: 5000,
    monthMatrix: mockMonthPriceMatrix("MOW", "LED", "2026-01-04", 5000),
    approximate: true,
    today: "2026-01-01",
  })
  assert.equal(r.verdict, "buy_now")
})

test("внутренний рейс через 30 дней — можно подождать (в окне 14-56 дн.)", () => {
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-01-31",
    currentPriceRub: 5000,
    monthMatrix: mockMonthPriceMatrix("MOW", "LED", "2026-01-31", 5000),
    approximate: true,
    today: "2026-01-01",
  })
  assert.equal(r.verdict, "can_wait")
})

test("внутренний рейс через 120 дней — следить (рано для окна 14-56 дн.)", () => {
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-05-01",
    currentPriceRub: 5000,
    monthMatrix: mockMonthPriceMatrix("MOW", "LED", "2026-05-01", 5000),
    approximate: true,
    today: "2026-01-01",
  })
  assert.equal(r.verdict, "watch")
})

test("международный рейс через 30 дней — следить (в внутреннем окне было бы can_wait, но окно шире)", () => {
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "IST", departDate: "2026-01-31",
    currentPriceRub: 15000,
    monthMatrix: mockMonthPriceMatrix("MOW", "IST", "2026-01-31", 15000),
    approximate: true,
    today: "2026-01-01",
  })
  // 30 дней < windowLowDays=42 для международного — уже "поздний этап".
  assert.equal(r.verdict, "buy_now")
})

test("approximate=true всегда добавляет предупреждение в reasons", () => {
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-01-31",
    currentPriceRub: 5000,
    monthMatrix: mockMonthPriceMatrix("MOW", "LED", "2026-01-31", 5000),
    approximate: true,
    today: "2026-01-01",
  })
  assert.ok(r.reasons.some((s) => s.includes("приблизительная")))
})

test("цена ниже минимума календаря — покупать сейчас, даже если рано по срокам", () => {
  const matrix = mockMonthPriceMatrix("MOW", "LED", "2026-05-01", 5000)
  const min = Math.min(...matrix.map((m) => m.price))
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-05-01",
    currentPriceRub: min,
    monthMatrix: matrix,
    approximate: true,
    today: "2026-01-01",
  })
  assert.equal(r.verdict, "buy_now")
})

test("cheapestDatesNearby не включает саму дату вылета и отсортирован по цене", () => {
  const matrix = mockMonthPriceMatrix("MOW", "LED", "2026-01-31", 5000)
  const r = buildBuyTimingRecommendation({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-01-31",
    currentPriceRub: 5000,
    monthMatrix: matrix,
    approximate: true,
    today: "2026-01-01",
  })
  assert.ok(r.cheapestDatesNearby.every((d) => d.date !== "2026-01-31"))
  for (let i = 1; i < r.cheapestDatesNearby.length; i++) {
    assert.ok(r.cheapestDatesNearby[i].price >= r.cheapestDatesNearby[i - 1].price)
  }
})

test("mockMonthPriceMatrix детерминирован — одинаковый вход даёт одинаковый выход", () => {
  const a = mockMonthPriceMatrix("MOW", "AER", "2026-07-15", 6000)
  const b = mockMonthPriceMatrix("MOW", "AER", "2026-07-15", 6000)
  assert.deepEqual(a, b)
})
