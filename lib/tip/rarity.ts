// Редкость полной формулы «день-месяц-год-полная_дата» — на основе
// предвычисленной таблицы lib/tip/rarity-data.ts (сгенерирована
// scripts/gen-tip-rarity.ts перебором всех дат 01.01.1930-31.12.2025).
//
// Используется на странице результата: «Формула 6-2-9-8 встречается у
// ~0,2% людей — редкое сочетание».

import { TIP_FORMULA_RARITY } from "@/lib/tip/rarity-data"

export type TipRarityLabel = "редкая" | "необычная" | "распространённая"

export interface TipFormulaRarity {
  /** Доля дат с такой полной формулой, в процентах (напр. 2.1). */
  pct: number
  label: TipRarityLabel
}

/**
 * Возвращает редкость полной формулы (все 4 позиции, напр. "6-2-9-8").
 * Формула не найдена в таблице (не должно случаться для валидных дат
 * 1930-2025, но входные данные пользователей шире) -> фолбэк: считаем
 * «распространённая» с pct=100/729 (равномерная оценка), чтобы не показывать
 * заведомо неверное «редкая» для неизвестного случая.
 */
export function getFormulaRarity(formulaString: string): TipFormulaRarity {
  const pct = TIP_FORMULA_RARITY[formulaString]

  if (pct === undefined) {
    const fallbackPct = Math.round((100 / 729) * 1000) / 1000
    return { pct: fallbackPct, label: "распространённая" }
  }

  let label: TipRarityLabel
  if (pct < 1) label = "редкая"
  else if (pct < 3) label = "необычная"
  else label = "распространённая"

  return { pct, label }
}

/** Форматирует число для отображения по-русски: запятая вместо точки, до 1 знака. */
export function formatRarityPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  return rounded.toString().replace(".", ",")
}

/**
 * label согласуется с «формула» (ж.р.) — «редкая формула». Для фраз вида
 * «... сочетание» (ср.р.) нужна форма среднего рода — эта функция её даёт:
 * «редкое», «необычное», «распространённое».
 */
export function rarityLabelNeuter(label: TipRarityLabel): string {
  switch (label) {
    case "редкая":
      return "редкое"
    case "необычная":
      return "необычное"
    case "распространённая":
      return "распространённое"
  }
}
