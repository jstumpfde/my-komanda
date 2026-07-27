import { test } from "node:test"
import assert from "node:assert/strict"
import { buildDateList, MAX_RANGE_DATES } from "./date-utils"

test("без toISO возвращает единственную точную дату", () => {
  assert.deepEqual(buildDateList("2026-08-15"), ["2026-08-15"])
})

test("короткий диапазон возвращает все даты подряд", () => {
  const dates = buildDateList("2026-08-01", "2026-08-04")
  assert.deepEqual(dates, ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"])
})

test("длинный диапазон сэмплируется не более MAX_RANGE_DATES точек, включая края", () => {
  const dates = buildDateList("2026-08-01", "2026-12-01")
  assert.ok(dates.length <= MAX_RANGE_DATES)
  assert.equal(dates[0], "2026-08-01")
  assert.equal(dates[dates.length - 1], "2026-12-01")
})

test("некорректный диапазон (до < от) откатывается к единственной дате", () => {
  assert.deepEqual(buildDateList("2026-08-15", "2026-08-01"), ["2026-08-15"])
})
