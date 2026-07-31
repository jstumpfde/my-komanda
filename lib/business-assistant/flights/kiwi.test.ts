import { test } from "node:test"
import assert from "node:assert/strict"
import { searchKiwiCombos } from "./kiwi"

test("без KIWI_TEQUILA_API_KEY combo не мокается — пустой массив (работаем только на Travelpayouts)", async () => {
  delete process.env.KIWI_TEQUILA_API_KEY
  const offers = await searchKiwiCombos({
    originIata: "MOW", destinationIata: "BKK", departDate: "2026-10-01", adults: 1,
  })
  assert.deepEqual(offers, [])
})
