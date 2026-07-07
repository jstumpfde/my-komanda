// Сборка промпта для AI-разбора «Типология» из именованных слоёв.
// Слои (base / shades / context:<slug> / style:<audience> / depth:<depth> /
// age_gate) хранятся ВНЕ кода (например в БД или файлах методики) и
// передаются сюда параметром — этот модуль ничего не знает про их
// происхождение и не обращается к БД.

import type { TipFormula } from "./calculation"
import { getTipContext } from "./contexts"

export type TipLayerKey =
  | "base"
  | "shades"
  | `context:${string}`
  | `style:${string}`
  | `depth:${string}`
  | "age_gate"

export type TipLayers = Map<string, string>

export interface TipPersonInput {
  name?: string
  gender?: "male" | "female" | string
  birthDate: string
}

export interface TipSecondPersonInput {
  name?: string
  birthDate: string
}

export interface TipRequestInput {
  name?: string
  gender?: string
  birthDate: string
  /** Слаг контекста из lib/tip/contexts.ts. */
  context: string
  /** Роль/должность — используется для employee/manager. */
  role?: string
  depth: string
  audience: string
  /** Дополнительный вопрос пользователя. */
  question?: string
  /** Второй человек — для парных контекстов (pairCapable). */
  second?: TipSecondPersonInput
}

export class TipValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TipValidationError"
  }
}

export interface TipValidationContext {
  isMinor: boolean
  secondIsMinor?: boolean
}

/**
 * Проверяет запрос ДО сборки промпта. Бросает TipValidationError с русским
 * текстом при нарушении жёстких правил возрастного гейта:
 *  - несовершеннолетняя дата + контекст «Личные отношения» (парный или нет) —
 *    отклоняем всегда;
 *  - несовершеннолетняя дата + парный контекст «Личные отношения» со вторым
 *    человеком — тоже отклоняем, даже если второй человек совершеннолетний;
 *  - контекст с minorAllowed=false, но isMinor=true — отклоняем.
 */
export function validateTipRequest(input: TipRequestInput, ctx: TipValidationContext): void {
  const context = getTipContext(input.context)
  if (!context) {
    throw new TipValidationError(`Неизвестный контекст разбора: «${input.context}».`)
  }

  if (input.context === "life_partnership" && ctx.isMinor) {
    throw new TipValidationError(
      "Разбор «Личные отношения» недоступен для несовершеннолетней даты рождения. Выберите контекст «Подросток / молодой человек» или «Родитель / семья / дети».",
    )
  }

  if (ctx.isMinor && !context.minorAllowed) {
    throw new TipValidationError(
      `Контекст «${context.title}» недоступен для несовершеннолетней даты рождения. Доступные контексты для несовершеннолетних: Личная карта развития, Подросток / молодой человек, Друзья / окружение, Карьера / профессия, Родитель / семья / дети, Конфликт / сложные отношения, Полный разбор.`,
    )
  }

  if (input.second) {
    if (input.context === "life_partnership" && ctx.secondIsMinor) {
      throw new TipValidationError(
        "Парный разбор «Личные отношения» недоступен, если дата рождения второго человека принадлежит несовершеннолетнему.",
      )
    }
    if (!context.pairCapable) {
      throw new TipValidationError(
        `Контекст «${context.title}» не поддерживает парный разбор (данные второго человека переданы, но не будут использованы).`,
      )
    }
  }
}

function formatDigits(digits: number[]): string {
  return digits.join("+")
}

function describeFormulaBlock(formula: TipFormula, label: string): string {
  const lines: string[] = []
  lines.push(`${label}:`)
  lines.push(`  Формула: ${formula.formulaString}`)
  lines.push(
    `  День: ${formula.day.value} (исходные цифры: ${formatDigits(formula.day.sourceDigits)}${
      formula.day.intermediate.length ? `, промежуточно: ${formula.day.intermediate.join(" -> ")}` : ""
    })`,
  )
  lines.push(
    `  Месяц: ${formula.month.value} (исходные цифры: ${formatDigits(formula.month.sourceDigits)}${
      formula.month.intermediate.length ? `, промежуточно: ${formula.month.intermediate.join(" -> ")}` : ""
    })`,
  )
  lines.push(
    `  Год: ${formula.year.value} (исходные цифры: ${formatDigits(formula.year.sourceDigits)}${
      formula.year.intermediate.length ? `, промежуточно: ${formula.year.intermediate.join(" -> ")}` : ""
    })`,
  )
  lines.push(
    `  Полная дата: ${formula.fullDate.value} (все цифры даты: ${formatDigits(
      formula.fullDate.sourceDigits,
    )}${formula.fullDate.intermediate.length ? `, промежуточно: ${formula.fullDate.intermediate.join(" -> ")}` : ""})`,
  )
  const repeated = formula.repeatedDigits.length
    ? formula.repeatedDigits.map(d => `${d} (${formula.digitCounts[d]}×)`).join(", ")
    : "нет"
  const missing = formula.missingDigits.length ? formula.missingDigits.join(", ") : "нет"
  lines.push(`  Повторяющиеся цифры в дате: ${repeated}`)
  lines.push(`  Отсутствующие цифры (1–9) в дате: ${missing}`)
  return lines.join("\n")
}

export interface BuildTipPromptParams {
  layers: TipLayers
  input: TipRequestInput
  formula: TipFormula
  secondFormula?: TipFormula
  age: number
  isMinor: boolean
}

export interface TipPrompt {
  system: string
  user: string
}

function joinLayers(parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n---\n\n")
}

/**
 * Собирает промпт (system + user) из именованных слоёв методики.
 * system = base + shades + context:<slug> + style:<audience> + depth:<depth>
 *          (+ age_gate, если isMinor).
 * user = структурированные входные данные + готовая формула (программно
 *        посчитанная — модель НЕ должна её пересчитывать).
 *
 * ВАЖНО: вызывающий код обязан сначала вызвать validateTipRequest — эта
 * функция сама age-gate не проверяет (кроме пометки в user-сообщении),
 * чтобы не дублировать источники истины по правилам валидации.
 */
export function buildTipPrompt(params: BuildTipPromptParams): TipPrompt {
  const { layers, input, formula, secondFormula, age, isMinor } = params
  const context = getTipContext(input.context)

  const systemParts = [
    layers.get("base"),
    layers.get("shades"),
    layers.get(`context:${input.context}`),
    layers.get(`style:${input.audience}`),
    layers.get(`depth:${input.depth}`),
  ]
  if (isMinor) {
    systemParts.push(layers.get("age_gate"))
  }
  const system = joinLayers(systemParts)

  const userLines: string[] = []

  userLines.push("### Данные для разбора (переданы программно, не запрашивай их у пользователя)")
  userLines.push("")
  userLines.push(`Имя: ${input.name?.trim() ? input.name.trim() : "не указано — пиши нейтрально, без имени"}`)
  userLines.push(
    `Пол: ${input.gender?.trim() ? input.gender.trim() : "не указан — пиши нейтрально, без гендерных окончаний там, где это важно"}`,
  )
  userLines.push(`Дата рождения: ${input.birthDate}`)
  userLines.push(`Возраст: ${age} лет${isMinor ? " (НЕСОВЕРШЕННОЛЕТНИЙ — см. возрастной гейт ниже)" : ""}`)
  userLines.push(`Контекст разбора: ${context ? context.title : input.context}`)
  if (input.role?.trim() && (input.context === "employee" || input.context === "manager")) {
    userLines.push(`Роль/должность: ${input.role.trim()}`)
  }
  userLines.push(`Глубина ответа: ${input.depth}`)
  userLines.push(`Назначение (стиль): ${input.audience}`)
  if (input.question?.trim()) {
    userLines.push(`Дополнительный вопрос пользователя: ${input.question.trim()}`)
  }

  if (isMinor) {
    userLines.push("")
    userLines.push(
      "ВНИМАНИЕ: дата рождения принадлежит несовершеннолетнему. Пиши в подростковом/бережном фрейме (развитие, самопознание, семья), без тем интимных отношений, денег как самоцели, жёстких формулировок про риски. Опирайся на возрастной гейт (age_gate) из системного промпта.",
    )
  }

  userLines.push("")
  userLines.push("### Расчёт (выполнен программно, не пересчитывай)")
  userLines.push("")
  userLines.push(describeFormulaBlock(formula, "Формула первого человека"))

  if (input.second) {
    userLines.push("")
    userLines.push("### Второй человек (для совместимости/парного разбора)")
    userLines.push("")
    userLines.push(
      `Имя: ${input.second.name?.trim() ? input.second.name.trim() : "не указано — пиши нейтрально"}`,
    )
    userLines.push(`Дата рождения: ${input.second.birthDate}`)
    if (secondFormula) {
      userLines.push(describeFormulaBlock(secondFormula, "Формула второго человека"))
    }
    userLines.push("")
    userLines.push(
      "Сделай раздел совместимости: как сочетаются формулы двух людей в выбранном контексте, где точки силы пары, где риски и что важно проговаривать/фиксировать.",
    )
  }

  const user = userLines.join("\n")

  return { system, user }
}
