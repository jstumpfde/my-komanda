import { test } from "node:test"
import assert from "node:assert/strict"
import { searchTravelpayouts } from "./travelpayouts"

test("без TRAVELPAYOUTS_API_TOKEN возвращает мок-предложения с корректным диплинком", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchTravelpayouts({
    originIata: "MOW", destinationIata: "LED", departDate: "2026-08-15", adults: 1,
  })
  assert.ok(offers.length > 0)
  assert.equal(offers[0].kind, "direct")
  assert.ok(offers[0].priceRub > 0)
  assert.ok(offers[0].deepLink.includes("marker=999999"))
  assert.ok(offers[0].deepLink.includes("origin_iata=MOW"))
  assert.ok(offers[0].deepLink.includes("destination_iata=LED"))
})

test("предложения отсортированы по возрастанию цены", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = await searchTravelpayouts({
    originIata: "MOW", destinationIata: "AER", departDate: "2026-09-01", adults: 1,
  })
  for (let i = 1; i < offers.length; i++) {
    assert.ok(offers[i].priceRub >= offers[i - 1].priceRub)
  }
})
