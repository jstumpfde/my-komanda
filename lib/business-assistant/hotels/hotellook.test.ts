import { test } from "node:test"
import assert from "node:assert/strict"
import { searchHotels } from "./hotellook"

test("без TRAVELPAYOUTS_API_TOKEN возвращает мок-отели с диплинком и marker", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchHotels({ cityIata: "MOW", checkIn: "2026-08-15", checkOut: "2026-08-18", adults: 2 })
  assert.ok(offers.length > 0)
  assert.ok(offers[0].priceRub > 0)
  assert.equal(offers[0].nights, 3)
  assert.ok(offers[0].deepLink.includes("marker=999999"))
  assert.ok(offers[0].deepLink.includes("search.hotellook.com"))
})

test("отели отсортированы по возрастанию цены", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = await searchHotels({ cityIata: "LED", checkIn: "2026-09-01", checkOut: "2026-09-04", adults: 2 })
  for (let i = 1; i < offers.length; i++) assert.ok(offers[i].priceRub >= offers[i - 1].priceRub)
})
