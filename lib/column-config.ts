export type CandidateAction = "advance" | "reject" | "reserve"

export const COLUMN_ORDER = ["new", "qualifying", "course", "interview", "offer"] as const

export const PROGRESS_BY_COLUMN: Record<string, number> = {
  new: 10,
  qualifying: 35,
  course: 60,
  interview: 75,
  offer: 90,
}

export function getNextColumnId(currentId: string): string | null {
  const idx = COLUMN_ORDER.indexOf(currentId as typeof COLUMN_ORDER[number])
  if (idx === -1 || idx === COLUMN_ORDER.length - 1) return null
  return COLUMN_ORDER[idx + 1]
}

export interface ColumnConfig {
  id: string
  title: string
  count: number
  color: string // tailwind gradient classes
  colorFrom: string
  colorTo: string
}

export const defaultColumnColors: Record<string, { from: string; to: string; label: string }> = {
  new: {
    from: "#22d3ee",
    to: "#06b6d4",
    label: "Новые",
  },
  qualifying: {
    from: "#f59e0b",
    to: "#d97706",
    label: "Квалификация",
  },
  course: {
    from: "#3b82f6",
    to: "#06b6d4",
    label: "Тестирование",
  },
  interview: {
    from: "#8b5cf6",
    to: "#7c3aed",
    label: "Интервью",
  },
  offer: {
    from: "#22c55e",
    to: "#16a34a",
    label: "Предложение",
  },
}
