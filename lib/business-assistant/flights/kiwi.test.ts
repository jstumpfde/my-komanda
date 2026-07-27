import { test } from "node:test"
import assert from "node:assert/strict"
import { searchKiwiCombos } from "./kiwi"

test("без KIWI_TEQUILA_API_KEY возвращает мок-комбо с экономией и click-трекером", async () => {
  delete process.env.KIWI_TEQUILA_API_KEY
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchKiwiCombos({
    originIata: "MOW", destinationIata: "BKK", departDate: "2026-10-01", adults: 1,
  })
  assert.ok(offers.length > 0)
  assert.equal(offers[0].kind, "combo")
  assert.ok(offers[0].savingsRub && offers[0].savingsRub > 0)
  assert.ok(offers[0].deepLink.startsWith("https://c111.travelpayouts.com/click?"))
  assert.ok(offers[0].deepLink.includes("shmarker=999999"))
})
