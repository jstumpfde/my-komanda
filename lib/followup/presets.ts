export type FollowUpPreset = "off" | "soft" | "standard" | "aggressive"

export const FOLLOWUP_PRESETS: Record<FollowUpPreset, { days: number[]; description: string; label: string }> = {
  off: {
    days: [],
    label: "Выкл",
    description: "Без дожима",
  },
  soft: {
    days: [2, 4, 8, 10],
    label: "Мягкий",
    description: "4 касания за 2 недели. Для редких позиций (директор, senior).",
  },
  standard: {
    days: [0, 2, 4, 8, 10, 15, 17],
    label: "Стандартный",
    description: "7 касаний за 3 недели. Рекомендуем для большинства.",
  },
  aggressive: {
    days: [0, 1, 2, 3, 4, 7, 9, 11, 15, 17],
    label: "Агрессивный",
    description: "10 касаний за 3 недели. Для массового найма.",
  },
}

export function isFollowUpPreset(value: unknown): value is FollowUpPreset {
  return typeof value === "string" && value in FOLLOWUP_PRESETS
}
