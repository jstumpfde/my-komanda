export type CandidateAction = "advance" | "reject" | "reserve" | "hire" | "think"

export const COLUMN_ORDER = ["new", "awaiting", "demo", "hr_decision", "interview", "final_decision", "hired"] as const

export const PROGRESS_BY_COLUMN: Record<string, number> = {
  new: 5,
  awaiting: 15,
  demo: 35,
  hr_decision: 60,
  interview: 75,
  final_decision: 90,
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
  new: { from: "#22d3ee", to: "#06b6d4", label: "Новые" },
  awaiting: { from: "#f59e0b", to: "#d97706", label: "Ожидает ответа" },
  demo: { from: "#3b82f6", to: "#06b6d4", label: "Демонстрация" },
  hr_decision: { from: "#ef4444", to: "#dc2626", label: "Решение HR" },
  interview: { from: "#8b5cf6", to: "#7c3aed", label: "Интервью" },
  final_decision: { from: "#f97316", to: "#ea580c", label: "Финальное решение" },
  hired: { from: "#22c55e", to: "#16a34a", label: "Нанят 🎉" },
}

// Колонки, где HR принимает решения
export const HR_DECISION_COLUMNS = ["hr_decision", "final_decision"]

// Колонки с автоматическим переходом (HR не перетаскивает)
export const AUTO_COLUMNS = ["new", "awaiting", "demo", "interview"]
