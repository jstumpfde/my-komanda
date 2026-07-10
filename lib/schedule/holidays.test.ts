// Тесты isNonWorkingDay — гейт праздников/нерабочих периодов для генератора
// слотов записи на интервью (аудит 11.07). Семантика = can-send-now.
import test from "node:test"
import assert from "node:assert/strict"
import { isNonWorkingDay } from "./holidays"

test("праздники: дефолт — все праздники РФ нерабочие", () => {
  assert.equal(isNonWorkingDay({ month: 1, day: 1, isoDate: "2027-01-01" }), true)
  assert.equal(isNonWorkingDay({ month: 5, day: 9, isoDate: "2027-05-09" }), true)
  assert.equal(isNonWorkingDay({ month: 7, day: 15, isoDate: "2026-07-15" }), false)
})

test("праздники: явный excluded-набор компании уважается", () => {
  // 23 февраля НЕ в наборе исключённых → компания в этот день работает
  assert.equal(isNonWorkingDay({ month: 2, day: 23, isoDate: "2027-02-23", excludedHolidayIds: ["jan_1"] }), false)
  assert.equal(isNonWorkingDay({ month: 1, day: 1, isoDate: "2027-01-01", excludedHolidayIds: ["jan_1"] }), true)
  // Пустой массив = «не настроено» → дефолт (все праздники нерабочие)
  assert.equal(isNonWorkingDay({ month: 1, day: 7, isoDate: "2027-01-07", excludedHolidayIds: [] }), true)
})

test("праздники: кастомный период — границы включительно", () => {
  const custom = [{ from: "2026-08-10", to: "2026-08-14", label: "Отпуск компании" }]
  assert.equal(isNonWorkingDay({ month: 8, day: 10, isoDate: "2026-08-10", customHolidays: custom }), true)
  assert.equal(isNonWorkingDay({ month: 8, day: 14, isoDate: "2026-08-14", customHolidays: custom }), true)
  assert.equal(isNonWorkingDay({ month: 8, day: 15, isoDate: "2026-08-15", customHolidays: custom }), false)
})

test("праздники: не-RU страна — список страны, RU-набор не применяется", () => {
  const by = ["01.01", "03.07"]
  assert.equal(isNonWorkingDay({ month: 1, day: 1, isoDate: "2027-01-01", country: "BY", countryHolidayDates: by }), true)
  assert.equal(isNonWorkingDay({ month: 7, day: 3, isoDate: "2026-07-03", country: "BY", countryHolidayDates: by }), true)
  // 23 февраля — праздник РФ, но не в списке BY → рабочий день
  assert.equal(isNonWorkingDay({ month: 2, day: 23, isoDate: "2027-02-23", country: "BY", countryHolidayDates: by }), false)
  // кастомные периоды работают и для не-RU
  assert.equal(isNonWorkingDay({
    month: 9, day: 1, isoDate: "2026-09-01", country: "BY", countryHolidayDates: by,
    customHolidays: [{ from: "2026-09-01", to: "2026-09-02", label: "Корпоратив" }],
  }), true)
})
