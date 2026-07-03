export type CandidateAction = "advance" | "reject" | "reserve" | "hire" | "think" | "preboarding" | "talent_pool" | "onboarding"

// Воронка после расширения (см. drizzle/0083):
//   new                — отклик создан, приглашение ещё не отправлено
//   primary_contact    — приглашение отправлено в hh-чат
//   demo_opened        — кандидат открыл /demo/<shortId>
//   decision           — демо пройдено до конца («Демо пройдено» в UI)
//   anketa_filled      — финальная анкета заполнена
//   ai_screening       — AI-скрининг (опциональная стадия HR)
//   interview          — собеседование назначено
//   final_decision     — финальное решение HR
//   hired              — нанят
//   (rejected, wants_contact — терминальные/боковые, не входят в COLUMN_ORDER)
export const COLUMN_ORDER = [
  "new",
  "primary_contact",
  "demo_opened",
  "decision",
  "anketa_filled",
  "ai_screening",
  "interview",
  "final_decision",
  "hired",
] as const

export const PROGRESS_BY_COLUMN: Record<string, number> = {
  new:             5,
  primary_contact: 12,
  // legacy alias — сохраняется для старых записей, не успевших мигрировать
  demo:            18,
  demo_opened:     22,
  decision:        35,
  anketa_filled:   45,
  ai_screening:    55,
  interview:       70,
  final_decision:  85,
  hired:           100,
}

// Стадии вне COLUMN_ORDER (тест-контур и пр.): куда двигает «Пригласить».
// Раньше indexOf возвращал -1 → null → advance «нанимал» кандидата со
// «2-й части» одной галочкой (инцидент 03.07, Тхай). Тест-стадии ведут
// на интервью; pending — на интервью (решение HR «двинуть дальше»).
const NEXT_BY_STAGE: Record<string, string> = {
  test_task_sent: "interview",
  test_task_done: "interview",
  test_passed:    "interview",
  pending:        "interview",
}

export function getNextColumnId(currentId: string): string | null {
  const mapped = NEXT_BY_STAGE[currentId]
  if (mapped) return mapped
  const idx = COLUMN_ORDER.indexOf(currentId as typeof COLUMN_ORDER[number])
  // Неизвестная стадия (-1) — НЕ двигаем никуда (раньше падали в «нанят»).
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
  new:              { from: "#94a3b8", to: "#64748b", label: "Отклик" },
  primary_contact:  { from: "#60a5fa", to: "#3b82f6", label: "Первичный контакт" },
  // legacy 'demo' оставлен на случай неуспевших мигрировать записей
  demo:             { from: "#3b82f6", to: "#2563eb", label: "Демо-курс" },
  demo_opened:      { from: "#6366f1", to: "#4f46e5", label: "Демо открыто" },
  decision:         { from: "#f59e0b", to: "#d97706", label: "Демо пройдено" },
  anketa_filled:    { from: "#fb923c", to: "#ea580c", label: "Анкета заполнена" },
  ai_screening:     { from: "#06b6d4", to: "#0891b2", label: "AI-скрининг" },
  interview:        { from: "#8b5cf6", to: "#7c3aed", label: "Собеседование" },
  final_decision:   { from: "#f97316", to: "#ea580c", label: "Оффер" },
  hired:            { from: "#22c55e", to: "#16a34a", label: "Нанят" },
  rejected:         { from: "#ef4444", to: "#dc2626", label: "Отказ" },
}

// Колонки, где HR принимает решения (показываются кнопки действий)
export const HR_DECISION_COLUMNS = ["decision", "anketa_filled", "final_decision"]

// Колонки с автоматическим переходом из системы
export const AUTO_COLUMNS = ["new", "primary_contact", "demo_opened", "demo", "interview"]
