// Центральный реестр AI-моделей платформы. ЕДИНСТВЕННОЕ место, где
// захардкожены model id — везде в коде импортировать отсюда.
//
// Политика (ревизия цен 02.07.2026):
//  - AI_MODEL_MAIN — основная модель (скоринг, генерация текстов, HR-чаты,
//    Нэнси/Юлия): claude-sonnet-5 — $2/$10 за MTok (промо до 31.08.2026,
//    далее $3/$15). Дешевле и новее claude-sonnet-4-6 ($3/$15), ~-33%.
//  - AI_MODEL_FAST — дешёвые/массовые задачи (пре/пост-фильтры чат-бота,
//    классификация ответов, скрининг резюме): claude-haiku-4-5 — $1/$5.
//
// ВАЖНО про claude-sonnet-5 (отличия от Sonnet 4.6):
//  1. non-default temperature/top_p/top_k → 400. НЕ передавать temperature
//     в вызовы с AI_MODEL_MAIN.
//  2. Без поля thinking по умолчанию включается ADAPTIVE thinking (на 4.6
//     отсутствие поля = выключен). Thinking-токены тратятся и входят в
//     max_tokens → JSON-ответы могут обрезаться. Политика пайплайна:
//     каждый вызов с AI_MODEL_MAIN передаёт thinking: { type: "disabled" };
//     adaptive включаем только осознанно и точечно.
//  3. Новый токенизатор: ~+30% токенов на тот же текст → у «впритык»
//     max_tokens добавлен запас (комментарий «запас под токенизатор Sonnet 5»).
export const AI_MODEL_MAIN = "claude-sonnet-5"
export const AI_MODEL_FAST = "claude-haiku-4-5-20251001"

// ── Прайс-таблица моделей (для пер-вызовного логирования стоимости, Юрий 05.07) ──
// ЕДИНСТВЕННОЕ место, где хранятся цены. $/MTok (input/output).
// claude-sonnet-5 — промо-цена до 31.08.2026, дальше $3/$15 (см. модуль-doc выше).
// TODO(31.08.2026): поднять claude-sonnet-5 на $3/$15 (промо-период истёк).
// AI_MODEL_FAST — старое строгое id с датой ("claude-haiku-4-5-20251001"), поэтому
// прайс ключуется и по алиасу "claude-haiku-4-5" (совпадает с семейством).
interface ModelPrice {
  inputPerMTok:  number
  outputPerMTok: number
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5":          { inputPerMTok: 2, outputPerMTok: 10 }, // промо до 31.08.2026
  "claude-haiku-4-5":         { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-4-6":        { inputPerMTok: 3, outputPerMTok: 15 },
  // Ревизия 10.07.2026 (выход Fable 5): Opus/Fable добавлены в прайс, чтобы
  // computeCostUsd не вернул null при точечном использовании. ПОЛИТИКА: в
  // конвейере платформы (кандидатский путь, скоринг, дожимы) их НЕ юзать.
  // Opus 4.8 — только редкие сложные разовые задачи. Fable 5 ($10/$50,
  // thinking всегда включён → ответы минутами, требует 30-дн retention,
  // может вернуть stop_reason=refusal) — НЕ для прод-фич, только
  // координация разработки (Claude Code).
  "claude-opus-4-8":          { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-fable-5":           { inputPerMTok: 10, outputPerMTok: 50 },
}

/**
 * Стоимость вызова в USD по прайс-таблице выше. Модель не найдена в таблице →
 * null (НЕ выдумываем цену для неизвестной/будущей модели).
 */
export function computeCostUsd(
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (!model) return null
  const price = MODEL_PRICES[model]
  if (!price) return null
  const tokIn = Number(inputTokens ?? 0)
  const tokOut = Number(outputTokens ?? 0)
  if (!Number.isFinite(tokIn) || !Number.isFinite(tokOut)) return null
  const cost = (tokIn / 1_000_000) * price.inputPerMTok + (tokOut / 1_000_000) * price.outputPerMTok
  return Number.isFinite(cost) ? cost : null
}
