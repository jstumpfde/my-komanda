export type CandidateAction = "advance" | "reject" | "reserve" | "hire" | "think"

export const COLUMN_ORDER = ["new", "demo", "scheduled", "interviewed", "hired"] as const

export const PROGRESS_BY_COLUMN: Record<string, number> = {
  new: 10,
  demo: 30,
  scheduled: 55,
  interviewed: 80,
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
  new: { from: "#94a3b8", to: "#64748b", label: "Всего откликов" },
  demo: { from: "#3b82f6", to: "#2563eb", label: "Прошли демонстрацию" },
  scheduled: { from: "#8b5cf6", to: "#7c3aed", label: "Назначено интервью" },
  interviewed: { from: "#f59e0b", to: "#d97706", label: "Прошли интервью" },
  hired: { from: "#22c55e", to: "#16a34a", label: "Нанято" },
}

// Колонки, где HR принимает решения
export const HR_DECISION_COLUMNS = ["interviewed"]

// Колонки с автоматическим переходом
export const AUTO_COLUMNS = ["new", "demo", "scheduled"]
