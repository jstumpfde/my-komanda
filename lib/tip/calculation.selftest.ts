// Самопроверка детерминированного движка (lib/tip/calculation.ts).
// Запуск: npx tsx lib/tip/calculation.selftest.ts
// (или через -e 'require("./lib/tip/calculation.selftest").runSelfTest()')

import { parseBirthDate, reduceToDigit, computeFormula, computeAge, TipCalculationError } from "./calculation"

interface Check {
  name: string
  pass: boolean
  detail?: string
}

export function runSelfTest(): { ok: boolean; checks: Check[] } {
  const checks: Check[] = []

  function assertEq(name: string, actual: unknown, expected: unknown) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    checks.push({
      name,
      pass,
      detail: pass ? undefined : `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`,
    })
  }

  function assertThrows(name: string, fn: () => void, expectedSubstring?: string) {
    try {
      fn()
      checks.push({ name, pass: false, detail: "ожидалась ошибка, но её не было" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const pass = e instanceof TipCalculationError && (!expectedSubstring || msg.includes(expectedSubstring))
      checks.push({ name, pass, detail: pass ? undefined : `сообщение: ${msg}` })
    }
  }

  // ── reduceToDigit ──────────────────────────────────────────────────────
  assertEq("reduceToDigit(24) -> 6", reduceToDigit(24), 6)
  assertEq("reduceToDigit(1998) -> 9", reduceToDigit(1998), 9)
  assertEq("reduceToDigit(5) -> 5", reduceToDigit(5), 5)
  assertEq("reduceToDigit(35) -> 8", reduceToDigit(35), 8)

  // ── Контрольный пример методики: 24.11.1998 -> 6-2-9-8 ───────────────────
  {
    const date = parseBirthDate("24.11.1998", new Date("2026-07-07T00:00:00Z"))
    const formula = computeFormula(date)
    assertEq("24.11.1998 formulaString", formula.formulaString, "6-2-9-8")
    assertEq("24.11.1998 day.value", formula.day.value, 6)
    assertEq("24.11.1998 day.sourceDigits ([2,4])", formula.day.sourceDigits, [2, 4])
    assertEq("24.11.1998 month.value", formula.month.value, 2)
    assertEq("24.11.1998 month.sourceDigits ([1,1])", formula.month.sourceDigits, [1, 1])
    assertEq("24.11.1998 year.value", formula.year.value, 9)
    assertEq("24.11.1998 year.sourceDigits ([1,9,9,8])", formula.year.sourceDigits, [1, 9, 9, 8])
    assertEq("24.11.1998 year.intermediate ([27])", formula.year.intermediate, [27])
    assertEq("24.11.1998 fullDate.value", formula.fullDate.value, 8)
    // 2+4+1+1+1+9+9+8 = 35 -> 3+5 = 8
    assertEq("24.11.1998 fullDate.intermediate includes 35", formula.fullDate.intermediate[0], 35)
    assertEq(
      "24.11.1998 fullDate.sourceDigits (ДДММГГГГ)",
      formula.fullDate.sourceDigits,
      [2, 4, 1, 1, 1, 9, 9, 8],
    )
    assertEq("24.11.1998 repeatedDigits includes 1 and 9", formula.repeatedDigits.sort(), [1, 9])
    assertEq("24.11.1998 digitCounts[1]", formula.digitCounts[1], 3)
    assertEq("24.11.1998 digitCounts[9]", formula.digitCounts[9], 2)
    assertEq(
      "24.11.1998 missingDigits (3,5,6,7)",
      formula.missingDigits.sort((a, b) => a - b),
      [3, 5, 6, 7],
    )

    const age = computeAge(date, new Date("2026-07-07T00:00:00Z"))
    assertEq("24.11.1998 age at 2026-07-07", age.age, 27)
    assertEq("24.11.1998 isMinor at 2026-07-07", age.isMinor, false)
  }

  // ── 01.01.2000 ────────────────────────────────────────────────────────
  {
    const date = parseBirthDate("01.01.2000", new Date("2026-07-07T00:00:00Z"))
    const formula = computeFormula(date)
    // день 1 -> 1, месяц 1 -> 1, год 2000 -> 2+0+0+0=2, полная дата
    // 0+1+0+1+2+0+0+0=4
    assertEq("01.01.2000 formulaString", formula.formulaString, "1-1-2-4")
    assertEq("01.01.2000 day.sourceDigits ([1])", formula.day.sourceDigits, [1])
    assertEq("01.01.2000 year.value", formula.year.value, 2)
    const age = computeAge(date, new Date("2026-07-07T00:00:00Z"))
    assertEq("01.01.2000 age at 2026-07-07", age.age, 26)
  }

  // ── 29.02.2024 (високосный год — валидная дата) ──────────────────────────
  {
    const date = parseBirthDate("29.02.2024", new Date("2026-07-07T00:00:00Z"))
    const formula = computeFormula(date)
    // день 29 -> 2+9=11 -> 1+1=2; месяц 2 -> 2; год 2024 -> 2+0+2+4=8;
    // полная дата 2+9+0+2+2+0+2+4=21 -> 2+1=3
    assertEq("29.02.2024 formulaString", formula.formulaString, "2-2-8-3")
    assertEq("29.02.2024 day.intermediate ([11])", formula.day.intermediate, [11])
    const age = computeAge(date, new Date("2026-07-07T00:00:00Z"))
    assertEq("29.02.2024 isMinor (2 года)", age.isMinor, true)
  }

  // ── Невалидные даты ───────────────────────────────────────────────────
  assertThrows("31.02.2000 не существует", () => parseBirthDate("31.02.2000", new Date("2026-07-07T00:00:00Z")))
  assertThrows("29.02.2023 не существует (не високосный)", () =>
    parseBirthDate("29.02.2023", new Date("2026-07-07T00:00:00Z")),
  )
  assertThrows("дата в будущем отклоняется", () =>
    parseBirthDate("01.01.2030", new Date("2026-07-07T00:00:00Z")),
  )
  assertThrows("год < 1900 отклоняется", () =>
    parseBirthDate("01.01.1899", new Date("2026-07-07T00:00:00Z")),
  )
  assertThrows("мусорная строка отклоняется", () => parseBirthDate("не дата"))
  assertThrows("пустая строка отклоняется", () => parseBirthDate(""))
  assertThrows("месяц 13 отклоняется", () => parseBirthDate("01.13.2000", new Date("2026-07-07T00:00:00Z")))

  // ── Короткий формат Д.М.ГГГГ ──────────────────────────────────────────
  {
    const date = parseBirthDate("5.1.1990", new Date("2026-07-07T00:00:00Z"))
    assertEq("5.1.1990 parses to day=5 month=1", [date.getUTCDate(), date.getUTCMonth() + 1], [5, 1])
  }

  const ok = checks.every(c => c.pass)
  return { ok, checks }
}

// Позволяет запустить напрямую: npx tsx lib/tip/calculation.selftest.ts
if (require.main === module) {
  const { ok, checks } = runSelfTest()
  for (const c of checks) {
    console.log(`${c.pass ? "OK  " : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`)
  }
  console.log(ok ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nЕСТЬ ПРОВАЛЕННЫЕ ПРОВЕРКИ")
  process.exit(ok ? 0 : 1)
}
