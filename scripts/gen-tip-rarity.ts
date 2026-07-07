/**
 * scripts/gen-tip-rarity.ts
 *
 * Перебирает ВСЕ календарные даты с 01.01.1930 по 31.12.2025, считает
 * формулу типологии через lib/tip/calculation.ts (computeFormula) и строит
 * распределение полных формул «день-месяц-год-полная_дата» (все 4 позиции)
 * по доле дат, попадающих в каждую формулу.
 *
 * Результат — lib/tip/rarity-data.ts: предвычисленная таблица
 * 'd-m-y-f' -> доля в процентах (0..100). Используется lib/tip/rarity.ts
 * (getFormulaRarity) для строки «встречается у ~X% людей» на странице
 * результата.
 *
 * Запуск: npx tsx scripts/gen-tip-rarity.ts
 *
 * Важно: это распределение ПО ДАТАМ КАЛЕНДАРЯ (не по реальной демографии
 * рождаемости) — приближение, но детерминированное и воспроизводимое.
 */

import { writeFileSync } from "fs"
import { join } from "path"
import { computeFormula } from "../lib/tip/calculation"

const START_YEAR = 1930
const END_YEAR = 2025

function daysInMonth(year: number, month: number): number {
  // month: 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function main() {
  const counts = new Map<string, number>()
  let total = 0

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (let month = 1; month <= 12; month++) {
      const dim = daysInMonth(year, month)
      for (let day = 1; day <= dim; day++) {
        const date = new Date(Date.UTC(year, month - 1, day))
        const formula = computeFormula(date)
        counts.set(formula.formulaString, (counts.get(formula.formulaString) ?? 0) + 1)
        total++
      }
    }
  }

  console.log(`[gen-tip-rarity] всего дат: ${total}, уникальных формул: ${counts.size}`)

  // Доля в процентах, с округлением до 3 знаков после запятой (хватает точности
  // для отображения "~2,1%", но не даём "0.000%" для редких формул — минимум
  // до 3 знаков сохраняет различимость).
  const pctEntries: [string, number][] = []
  for (const [formula, count] of counts.entries()) {
    const pct = (count / total) * 100
    pctEntries.push([formula, Math.round(pct * 1000) / 1000])
  }
  pctEntries.sort((a, b) => a[0].localeCompare(b[0]))

  const lines: string[] = []
  lines.push("// АВТОГЕНЕРИРОВАНО: scripts/gen-tip-rarity.ts. НЕ редактировать руками.")
  lines.push("// Перебор всех календарных дат 01.01.1930-31.12.2025, распределение")
  lines.push("// полных формул «день-месяц-год-полная_дата» по доле дат (в процентах).")
  lines.push(`// Всего дат в выборке: ${total}. Уникальных формул: ${counts.size}.`)
  lines.push("// Используется lib/tip/rarity.ts (getFormulaRarity).")
  lines.push("")
  lines.push("export const TIP_FORMULA_RARITY: Record<string, number> = {")
  for (const [formula, pct] of pctEntries) {
    lines.push(`  "${formula}": ${pct},`)
  }
  lines.push("}")
  lines.push("")

  const outPath = join(__dirname, "..", "lib", "tip", "rarity-data.ts")
  writeFileSync(outPath, lines.join("\n"), "utf-8")
  console.log(`[gen-tip-rarity] записано: ${outPath}`)

  // Контрольная формула из докстринга calculation.ts: 24.11.1998 -> 6-2-9-8.
  const control = counts.get("6-2-9-8")
  if (control) {
    const pct = Math.round((control / total) * 100000) / 1000
    console.log(`[gen-tip-rarity] контроль 6-2-9-8: ${control} дат, ${pct}%`)
  } else {
    console.log("[gen-tip-rarity] контроль 6-2-9-8: не найдено (неожиданно)")
  }
}

main()
