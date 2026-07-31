import type { BaggageAllowance } from "./types"
import { seedHash } from "./date-utils"

export const UNKNOWN_BAGGAGE: BaggageAllowance = {
  handLuggage: null,
  checkedBaggage: null,
  unknown: true,
}

/** Человекочитаемая подпись багажа для карточки предложения. */
export function formatBaggageLabel(b: BaggageAllowance): string {
  if (b.unknown) return "Багаж: уточняйте по тарифу"
  const parts: string[] = []
  parts.push(
    b.checkedBaggage
      ? `Багаж: ${b.checkedBaggage.pieces}×${b.checkedBaggage.weightKg} кг`
      : "Без багажа (только ручная кладь)",
  )
  if (b.handLuggage) {
    parts.push(`Ручная кладь: ${b.handLuggage.pieces}×${b.handLuggage.weightKg} кг`)
  }
  const label = parts.join(" · ")
  return b.worstSegmentNote ? `${label} (${b.worstSegmentNote})` : label
}

/** Правдоподобная псевдослучайная, но воспроизводимая багажная норма для
 *  мок-режима (без реального ключа провайдера) — деталь для "живого" вида UI. */
export function mockBaggage(seedKey: string, cabinClass: "economy" | "business"): BaggageAllowance {
  const seed = seedHash(`${seedKey}-baggage`)
  const hasChecked = cabinClass === "business" || seed % 3 !== 0 // бизнес — всегда с багажом
  const checkedWeight = cabinClass === "business" ? 32 : [20, 23, 23, 25][seed % 4]
  return {
    handLuggage: { pieces: 1, weightKg: cabinClass === "business" ? 10 : 8 },
    checkedBaggage: hasChecked ? { pieces: cabinClass === "business" ? 2 : 1, weightKg: checkedWeight } : null,
    unknown: false,
  }
}

/** Багаж составного маршрута (combo) — по худшему (минимальному) сегменту из
 *  нескольких плеч, с явной подписью в UI. */
export function worstOfSegments(segments: BaggageAllowance[]): BaggageAllowance {
  const known = segments.filter((s) => !s.unknown)
  if (known.length === 0) return { ...UNKNOWN_BAGGAGE, worstSegmentNote: "по худшему из перелётов маршрута" }

  const worstChecked = known.reduce<{ pieces: number; weightKg: number } | null>((worst, s) => {
    if (!s.checkedBaggage) return null // хотя бы один сегмент без регистрируемого багажа — по нему и считаем
    if (worst === null) return worst // уже был сегмент вовсе без багажа — минимум остаётся "нет"
    return s.checkedBaggage.weightKg < worst.weightKg ? s.checkedBaggage : worst
  }, known[0].checkedBaggage)

  const worstHand = known.reduce<{ pieces: number; weightKg: number } | null>((worst, s) => {
    if (!s.handLuggage) return null
    if (worst === null) return worst
    return s.handLuggage.weightKg < worst.weightKg ? s.handLuggage : worst
  }, known[0].handLuggage)

  return {
    handLuggage: worstHand,
    checkedBaggage: worstChecked,
    unknown: false,
    worstSegmentNote: "по худшему из перелётов маршрута",
  }
}
