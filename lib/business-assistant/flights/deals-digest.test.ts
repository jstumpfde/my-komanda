import { test } from "node:test"
import assert from "node:assert/strict"
import { selectDigestDeals, buildDigestMessage, DIGEST_MIN_PRICE_RUB } from "./deals-digest"
import type { FlightDeal } from "@/lib/db/schema"

const NOW = new Date("2026-08-02T09:00:00Z")

let seq = 0
function makeDeal(overrides: Partial<FlightDeal> = {}): FlightDeal {
  seq += 1
  return {
    id: `deal-${seq}`,
    routeFrom: "Москва",
    routeTo: "Анталья",
    priceRub: 5000,
    sourceChannel: "travelradar",
    sourceMessageUrl: `https://t.me/travelradar/${seq}`,
    rawText: "текст поста",
    aiExtractedJson: null,
    validUntil: null,
    createdAt: new Date(NOW.getTime() - 60 * 60_000), // час назад
    ...overrides,
  } as FlightDeal
}

test("отбирает только находки за последние 24 часа", () => {
  const fresh = makeDeal({ createdAt: new Date(NOW.getTime() - 60 * 60_000) })
  const stale = makeDeal({ createdAt: new Date(NOW.getTime() - 25 * 60 * 60_000) })
  const another = makeDeal({ createdAt: new Date(NOW.getTime() - 2 * 60 * 60_000) })
  const result = selectDigestDeals([fresh, stale, another], NOW)
  // eligibleCount должен учитывать только 2 свежих поста
  assert.equal(result.eligibleCount, 2)
  assert.equal(result.shouldSend, false) // < 3 находок
})

test("отсекает находки с нераспознанным маршрутом", () => {
  const deals = [
    makeDeal({ routeFrom: "?", routeTo: "Анталья" }),
    makeDeal({ routeFrom: "Москва", routeTo: "?" }),
    makeDeal({ routeFrom: "", routeTo: "Дубай" }),
    makeDeal({ sourceChannel: "travelradar" }),
    makeDeal({ sourceChannel: "piratesru" }),
    makeDeal({ sourceChannel: "nachemodanah" }),
  ]
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.eligibleCount, 3) // только 3 последние с распознанным маршрутом
  assert.equal(result.shouldSend, true)
  assert.equal(result.deals.length, 3)
})

test("отсекает находки дешевле порога отсева мусора", () => {
  const deals = [
    makeDeal({ priceRub: DIGEST_MIN_PRICE_RUB - 1 }),
    makeDeal({ priceRub: DIGEST_MIN_PRICE_RUB }),
    makeDeal({ priceRub: 3000 }),
    makeDeal({ priceRub: 4000 }),
  ]
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.eligibleCount, 3) // цена >= порога, самая дешёвая (< порога) отсеяна
  assert.equal(result.shouldSend, true)
})

test("не слать дайджест, если находок за сутки меньше 3", () => {
  const deals = [makeDeal(), makeDeal()]
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.shouldSend, false)
  assert.equal(result.deals.length, 0)
})

test("слать дайджест ровно при пороге в 3 находки (разные каналы)", () => {
  const deals = [
    makeDeal({ sourceChannel: "travelradar" }),
    makeDeal({ sourceChannel: "piratesru" }),
    makeDeal({ sourceChannel: "nachemodanah" }),
  ]
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.shouldSend, true)
  assert.equal(result.deals.length, 3)
})

test("не больше 2 находок на канал", () => {
  const deals = [
    makeDeal({ sourceChannel: "travelradar", priceRub: 3000 }),
    makeDeal({ sourceChannel: "travelradar", priceRub: 3500 }),
    makeDeal({ sourceChannel: "travelradar", priceRub: 4000 }), // третья с того же канала — отсечена лимитом
    makeDeal({ sourceChannel: "piratesru", priceRub: 4500 }),
    makeDeal({ sourceChannel: "nachemodanah", priceRub: 5000 }),
  ]
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.eligibleCount, 5)
  assert.equal(result.deals.length, 4)
  const travelradarCount = result.deals.filter((d) => d.sourceChannel === "travelradar").length
  assert.equal(travelradarCount, 2)
})

test("ограничивает топ 8 находками и сортирует по цене по возрастанию", () => {
  const deals = Array.from({ length: 12 }, (_, i) =>
    makeDeal({
      sourceChannel: `channel-${i}`, // разные каналы — лимит на канал не мешает
      priceRub: 10000 - i * 100,
    }),
  )
  const result = selectDigestDeals(deals, NOW)
  assert.equal(result.deals.length, 8)
  for (let i = 1; i < result.deals.length; i++) {
    assert.ok(result.deals[i].priceRub >= result.deals[i - 1].priceRub)
  }
  // самые дешёвые (последние в исходном массиве) должны попасть в топ
  assert.equal(result.deals[0].priceRub, 8900)
})

test("buildDigestMessage форматирует заголовок, строки маршрутов и ссылку на модуль", () => {
  const deals = [
    makeDeal({
      routeFrom: "Москва",
      routeTo: "Дубай",
      priceRub: 12345,
      sourceChannel: "travelradar",
      sourceMessageUrl: "https://t.me/travelradar/1",
    }),
  ]
  const message = buildDigestMessage(deals)
  const expectedPrice = (12345).toLocaleString("ru-RU")
  assert.ok(message.includes("Дешёвые билеты"))
  assert.ok(message.includes("Москва") && message.includes("Дубай"))
  assert.ok(message.includes(expectedPrice))
  assert.ok(message.includes("https://t.me/travelradar/1"))
  assert.ok(message.includes("travelradar"))
  assert.ok(message.includes("business-assistant/flights"))
})
