export type FollowUpPreset = "off" | "soft" | "standard" | "aggressive"

// Поля:
//   days[i]           — день отправки i-го касания (offset от приглашения)
//   messageIndexes[i] — индекс текста (0..8) в массиве из 9 шаблонов касаний,
//                       которым отправляется i-е касание. Это позволяет
//                       пользователю редактировать ВСЕ 9 текстов в UI, а
//                       пресет лишь выбирает, какие из них использовать.
//
// Ключ "aggressive" оставлен ради совместимости с уже сохранёнными в БД
// значениями follow_up_campaigns.preset; для UI используется label "Активный".
export const FOLLOWUP_PRESETS: Record<FollowUpPreset, {
  days:           number[]
  messageIndexes: number[]
  description:    string
  label:          string
}> = {
  off: {
    days:           [],
    messageIndexes: [],
    label:          "Выкл",
    description:    "Без дожима",
  },
  soft: {
    days:           [1, 2, 4, 7, 10],
    // тексты 1, 2, 4, 7, 9 (1-based) → 0, 1, 3, 6, 8
    messageIndexes: [0, 1, 3, 6, 8],
    label:          "Мягкий",
    description:    "5 касаний за 10 дней. Для редких позиций (директор, senior).",
  },
  standard: {
    days:           [1, 2, 4, 6, 9, 12, 15],
    // тексты 1, 2, 4, 5, 7, 8, 9 → 0, 1, 3, 4, 6, 7, 8
    messageIndexes: [0, 1, 3, 4, 6, 7, 8],
    label:          "Стандартный",
    description:    "7 касаний за 15 дней. Рекомендуем для большинства.",
  },
  aggressive: {
    days:           [1, 2, 3, 5, 7, 10, 14, 16, 21],
    // все 9 текстов в порядке 1..9
    messageIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    label:          "Активный",
    description:    "9 касаний за 21 день. Для массового найма.",
  },
}

export function isFollowUpPreset(value: unknown): value is FollowUpPreset {
  return typeof value === "string" && value in FOLLOWUP_PRESETS
}

// Сколько всего шаблонов касаний поддерживает текущая раскладка.
// Используется в UI (рендерим всегда 9 textarea) и в backend
// (мерж кастомных значений с дефолтами до этой длины).
export const FOLLOWUP_MESSAGE_SLOTS = 9
