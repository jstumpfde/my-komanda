export type CandidateAction = "advance" | "reject" | "reserve" | "hire" | "think" | "preboarding" | "talent_pool" | "onboarding"

export const COLUMN_ORDER = [
  "new",
  "demo",
  "decision",
  "interview",
  "final_decision",
  "hired",
] as const

export const PROGRESS_BY_COLUMN: Record<string, number> = {
  new: 5,
  demo: 20,
  decision: 40,
  interview: 60,
  final_decision: 80,
  hired: 100,
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
  color: string
  colorFrom: string
  colorTo: string
}

export const defaultColumnColors: Record<string, { from: string; to: string; label: string }> = {
  new:              { from: "#94a3b8", to: "#64748b", label: "Новый" },
  demo:             { from: "#3b82f6", to: "#2563eb", label: "Демо-курс" },
  decision:         { from: "#ef4444", to: "#dc2626", label: "Решение" },
  interview:        { from: "#8b5cf6", to: "#7c3aed", label: "Интервью" },
  final_decision:   { from: "#f97316", to: "#ea580c", label: "Финальное решение" },
  hired:            { from: "#22c55e", to: "#16a34a", label: "Нанят" },
}

// Колонки, где HR принимает решения (показываются кнопки действий)
export const HR_DECISION_COLUMNS = ["decision", "final_decision"]

// Колонки с автоматическим переходом
export const AUTO_COLUMNS = ["new", "demo", "interview"]
