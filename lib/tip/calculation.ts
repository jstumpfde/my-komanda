// Детерминированный расчётный движок модуля «Типология».
// Чистые функции без внешних зависимостей (без БД, без AI, без fs).
// Методика: docs/tip/methodology-base.txt (раздел 2 «Правила расчёта»)
// и docs/tip/methodology-shades.txt (оттенки/повторы/отсутствующие цифры).

export class TipCalculationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TipCalculationError"
  }
}

// ── Парсинг даты рождения ──────────────────────────────────────────────────

const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/

/**
 * Парсит дату рождения в формате ДД.ММ.ГГГГ (также принимает Д.М.ГГГГ,
 * например «5.1.1990»). Проверяет реальность даты (не 31.02 и т.п.),
 * что дата не в будущем, и что год >= 1900.
 * Возвращает Date (UTC-полночь) либо бросает TipCalculationError с русским текстом.
 */
export function parseBirthDate(input: string, now: Date = new Date()): Date {
  const raw = (input ?? "").trim()
  if (!raw) {
    throw new TipCalculationError("Дата рождения обязательна. Укажите её в формате ДД.ММ.ГГГГ.")
  }

  const match = DATE_RE.exec(raw)
  if (!match) {
    throw new TipCalculationError(
      `Не удалось распознать дату «${raw}». Укажите дату в формате ДД.ММ.ГГГГ, например 24.11.1998.`,
    )
  }

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  if (year < 1900) {
    throw new TipCalculationError("Год рождения должен быть не раньше 1900.")
  }
  if (month < 1 || month > 12) {
    throw new TipCalculationError(`Некорректный месяц: ${month}. Месяц должен быть от 1 до 12.`)
  }
  if (day < 1 || day > 31) {
    throw new TipCalculationError(`Некорректный день: ${day}. День должен быть от 1 до 31.`)
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  // Date «переносит» несуществующие дни (напр. 31.02) на следующий месяц —
  // если после конструирования компоненты не совпали, дата нереальна.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TipCalculationError(`Дата ${raw} не существует в календаре.`)
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (date.getTime() > today.getTime()) {
    throw new TipCalculationError("Дата рождения не может быть в будущем.")
  }

  return date
}

// ── Свёртка цифр ───────────────────────────────────────────────────────────

/**
 * Сворачивает число до одной цифры (1–9) последовательным сложением цифр.
 * 24 -> 2+4=6; 1998 -> 1+9+9+8=27 -> 2+7=9.
 * Ноль сворачивается в 0 (не встречается в методике как самостоятельное
 * значение, но функция не должна падать на крайних случаях).
 */
export function reduceToDigit(n: number): number {
  let value = Math.abs(Math.trunc(n))
  if (value === 0) return 0
  while (value > 9) {
    value = String(value)
      .split("")
      .reduce((sum, ch) => sum + Number(ch), 0)
  }
  return value
}

/** Разбивает неотрицательное целое на массив его цифр: 1998 -> [1,9,9,8]. */
function digitsOf(n: number): number[] {
  return String(Math.abs(Math.trunc(n)))
    .split("")
    .map(Number)
}

/** Суммирует массив цифр в одно число (промежуточная сумма). */
function sumDigits(digits: number[]): number {
  return digits.reduce((a, b) => a + b, 0)
}

/**
 * Сворачивает число до одной цифры, возвращая всю цепочку промежуточных
 * сумм. Пример: 1998 -> intermediates=[27], final=9.
 * Если число уже однозначное — intermediates = [].
 */
function reduceWithIntermediates(n: number): { value: number; intermediates: number[] } {
  const intermediates: number[] = []
  let value = Math.abs(Math.trunc(n))
  while (value > 9) {
    value = sumDigits(digitsOf(value))
    // Промежуточная сумма попадает в список, только если свёртка на этом не
    // закончилась (иначе финальная однозначная цифра задвоилась бы и в
    // value, и в intermediates — см. пример в докстринге: 1998 -> [27]).
    if (value > 9) intermediates.push(value)
  }
  return { value, intermediates }
}

// ── Формула из 4 позиций ────────────────────────────────────────────────────

export interface FormulaPosition {
  /** Итоговая свёрнутая цифра (1–9). */
  value: number
  /** Исходные цифры, из которых складывалась эта позиция (оттенки). */
  sourceDigits: number[]
  /** Промежуточные суммы на пути свёртки (напр. [27] для года 1998, [35] для полной даты). */
  intermediate: number[]
}

export interface TipFormula {
  day: FormulaPosition
  month: FormulaPosition
  year: FormulaPosition
  fullDate: FormulaPosition
  /** «6-2-9-8» — день-месяц-год-полная дата. */
  formulaString: string
  /** Сколько раз каждая цифра 1–9 встречается во всей дате (ДДММГГГГ). */
  digitCounts: Record<number, number>
  /** Какие цифры 1–9 отсутствуют в дате. */
  missingDigits: number[]
  /** Какие цифры повторяются (встречаются 2+ раза) в дате. */
  repeatedDigits: number[]
}

/**
 * Считает формулу типологии по методике (docs/tip/methodology-base.txt,
 * раздел 2) с оттенками (docs/tip/methodology-shades.txt).
 * Контрольный пример: 24.11.1998 -> 6-2-9-8, полная дата сворачивается
 * через промежуточную сумму 35 (2+4+1+1+1+9+9+8=35 -> 3+5=8).
 */
export function computeFormula(date: Date): TipFormula {
  const day = date.getUTCDate()
  const month = date.getUTCMonth() + 1
  const year = date.getUTCFullYear()

  const dayDigits = digitsOf(day)
  const monthDigits = digitsOf(month)
  const yearDigits = digitsOf(year)

  const dayReduced = reduceWithIntermediates(day)
  const monthReduced = reduceWithIntermediates(month)
  const yearReduced = reduceWithIntermediates(year)

  // Полная дата: сумма ВСЕХ цифр строки ДДММГГГГ (не сумма уже свёрнутых
  // позиций) — так задано методикой (пример: 2+4+1+1+1+9+9+8=35 -> 8).
  // Формируем ДДММГГГГ как строку с ведущими нулями, чтобы день/месяц
  // из одной цифры (напр. 5 -> "05") тоже давали все цифры строки.
  const ddmmyyyy =
    String(day).padStart(2, "0") + String(month).padStart(2, "0") + String(year).padStart(4, "0")
  const fullDateDigits = ddmmyyyy.split("").map(Number)
  const fullDateFirstSum = sumDigits(fullDateDigits)
  const fullDateReduced = reduceWithIntermediates(fullDateFirstSum)
  const fullDateIntermediate =
    fullDateFirstSum > 9 ? [fullDateFirstSum, ...fullDateReduced.intermediates] : []

  const dayPos: FormulaPosition = {
    value: dayReduced.value,
    sourceDigits: dayDigits,
    intermediate: dayReduced.intermediates,
  }
  const monthPos: FormulaPosition = {
    value: monthReduced.value,
    sourceDigits: monthDigits,
    intermediate: monthReduced.intermediates,
  }
  const yearPos: FormulaPosition = {
    value: yearReduced.value,
    sourceDigits: yearDigits,
    intermediate: yearReduced.intermediates,
  }
  const fullDatePos: FormulaPosition = {
    value: fullDateReduced.value,
    sourceDigits: fullDateDigits,
    intermediate: fullDateIntermediate,
  }

  const formulaString = `${dayPos.value}-${monthPos.value}-${yearPos.value}-${fullDatePos.value}`

  const digitCounts: Record<number, number> = {}
  for (let d = 1; d <= 9; d++) digitCounts[d] = 0
  for (const d of fullDateDigits) {
    if (d >= 1 && d <= 9) digitCounts[d] = (digitCounts[d] ?? 0) + 1
  }
  const missingDigits: number[] = []
  const repeatedDigits: number[] = []
  for (let d = 1; d <= 9; d++) {
    if (digitCounts[d] === 0) missingDigits.push(d)
    if (digitCounts[d] >= 2) repeatedDigits.push(d)
  }

  return {
    day: dayPos,
    month: monthPos,
    year: yearPos,
    fullDate: fullDatePos,
    formulaString,
    digitCounts,
    missingDigits,
    repeatedDigits,
  }
}

// ── Возраст ──────────────────────────────────────────────────────────────

export interface TipAge {
  age: number
  isMinor: boolean
}

/** Считает полные годы на дату now (по умолчанию — текущий момент). */
export function computeAge(date: Date, now: Date = new Date()): TipAge {
  let age = now.getUTCFullYear() - date.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - date.getUTCMonth()
  const dayDiff = now.getUTCDate() - date.getUTCDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  if (age < 0) age = 0
  return { age, isMinor: age < 18 }
}
