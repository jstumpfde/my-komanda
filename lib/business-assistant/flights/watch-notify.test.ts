import { test } from "node:test"
import assert from "node:assert/strict"
import {
  shouldNotifyPriceDrop,
  buildPriceDropNotification,
  buildTelegramMessage,
  isValidTelegramChatId,
} from "./watch-notify"

test("уведомляет, когда цена достигла targetPriceRub", () => {
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: 5000, lastPriceRub: 8000 }, 4900), true)
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: 5000, lastPriceRub: 8000 }, 5000), true)
})

test("не уведомляет, если цена выше targetPriceRub и упала меньше 15%", () => {
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: 3000, lastPriceRub: 10000 }, 9200), false) // -8%
})

test("уведомляет при падении >=15% от последней цены, даже без targetPriceRub", () => {
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: null, lastPriceRub: 10000 }, 8500), true) // -15%
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: null, lastPriceRub: 10000 }, 8600), false) // -14%
})

test("без lastPriceRub и без targetPriceRub — не уведомляет (не с чем сравнивать)", () => {
  assert.equal(shouldNotifyPriceDrop({ targetPriceRub: null, lastPriceRub: null }, 5000), false)
})

test("buildPriceDropNotification: текст на русском, упоминает маршрут и цену — целевая", () => {
  const { title, body } = buildPriceDropNotification(
    { originIata: "MOW", destinationIata: "LED", targetPriceRub: 5000, lastPriceRub: 8000 },
    4900,
  )
  assert.ok(title.includes("MOW → LED"))
  assert.ok(body.includes("4900") || /4\s900/u.test(body))
  assert.ok(body.includes("целевая цена"))
})

test("buildPriceDropNotification: текст на русском — падение цены без цели", () => {
  const { title, body } = buildPriceDropNotification(
    { originIata: "MOW", destinationIata: "AER", targetPriceRub: null, lastPriceRub: 10000 },
    8000,
  )
  assert.ok(title.includes("MOW → AER"))
  assert.ok(body.includes("−20%"))
})

test("buildTelegramMessage: HTML, жирный заголовок, маршрут+дата, рейс, багаж, ссылка «Купить на Aviasales»", () => {
  const text = buildTelegramMessage(
    { originIata: "MOW", destinationIata: "LED", targetPriceRub: 5000, lastPriceRub: 8000 },
    4900,
    {
      departDate: "2026-08-30",
      airlineLabel: "Аэрофлот",
      baggage: { handLuggage: { pieces: 1, weightKg: 8 }, checkedBaggage: { pieces: 1, weightKg: 23 }, unknown: false },
      deepLink: "https://search.aviasales.com/flights/?origin_iata=MOW&destination_iata=LED",
    },
  )
  assert.ok(text.includes("<b>"))
  assert.ok(text.includes("MOW → LED, 2026-08-30"))
  assert.ok(text.includes("Аэрофлот"))
  assert.ok(text.includes("Багаж: 1×23 кг"))
  assert.ok(text.includes('<a href="https://search.aviasales.com'))
  assert.ok(text.includes("Купить на Aviasales"))
})

test("buildTelegramMessage: без деталей рейса — работает без ссылки/багажа", () => {
  const text = buildTelegramMessage({ originIata: "MOW", destinationIata: "AER", targetPriceRub: null, lastPriceRub: 10000 }, 8000)
  assert.ok(text.includes("MOW → AER"))
  assert.ok(!text.includes("Купить"))
})

test("isValidTelegramChatId: числовой ID валиден, отрицательный (группы) валиден, мусор — нет", () => {
  assert.equal(isValidTelegramChatId("8032840032"), true)
  assert.equal(isValidTelegramChatId("-1001234567890"), true)
  assert.equal(isValidTelegramChatId(" 12345 "), true)
  assert.equal(isValidTelegramChatId(""), false)
  assert.equal(isValidTelegramChatId("@username"), false)
  assert.equal(isValidTelegramChatId("abc123"), false)
})
