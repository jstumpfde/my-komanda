// Группа 25 / эталонный дефолт (07.07.2026): чистые функции разбора и
// нормализации ответа AI на buildSuggestRequirementsPrompt (см.
// suggest-requirements.ts). Вынесены отдельно от route.ts, чтобы покрыть
// тестами арифметику весов без поднятия Next.js route handler'а.

export interface WeightedNiceToHave {
  text:   string
  weight: number
}

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t || undefined
}

/** Простой список строк (must_have / deal_breakers): trim, отброс пустых/слишком длинных, лимит. */
export function cleanArray(input: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const item of input) {
    const t = trimOrUndefined(item)
    if (!t || t.length > maxLen) continue
    out.push(t)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * nice_to_have с весами оси: AI возвращает [{text, weight}], но иногда (либо
 * старый формат промпта, либо AI недослушал схему) может прислать простые
 * строки — принимаем оба формата и нормализуем. Веса клампим в [0,100];
 * пункты без валидного weight делят ПОРОВНУ остаток бюджета 100 минус сумма
 * явно заданных весов — та же формула, что buildAxes() в
 * lib/core/spec/axis-scorer.ts, чтобы предложение уже приходило в UI с
 * осмысленной суммой ≈100 ещё до сохранения в Spec.
 */
export function cleanWeightedArray(input: unknown, maxItems: number, maxLen = 200): WeightedNiceToHave[] {
  if (!Array.isArray(input)) return []
  const out: WeightedNiceToHave[] = []
  for (const item of input) {
    let text: string | undefined
    let weight: number | undefined
    if (typeof item === "string") {
      text = trimOrUndefined(item)
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>
      text = trimOrUndefined(obj.text)
      if (typeof obj.weight === "number" && Number.isFinite(obj.weight)) {
        weight = Math.max(0, Math.min(100, Math.round(obj.weight)))
      }
    }
    if (!text || text.length > maxLen) continue
    out.push(weight === undefined ? { text, weight: 0 } : { text, weight })
    if (out.length >= maxItems) break
  }

  const explicit = out.filter(o => o.weight > 0)
  const missing = out.filter(o => o.weight === 0)
  if (missing.length > 0) {
    const fixedSum = explicit.reduce((s, o) => s + o.weight, 0)
    const budget = Math.max(0, 100 - fixedSum)
    const base = Math.floor(budget / missing.length)
    const rem = budget - base * missing.length
    let seen = 0
    for (const o of out) {
      if (o.weight === 0) {
        o.weight = base + (seen < rem ? 1 : 0)
        seen++
      }
    }
  }
  return out
}
