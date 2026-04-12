export const DEAL_STAGES = [
  { id: "new",         label: "Новая",        color: "#6B7280", probability: 10 },
  { id: "qualifying",  label: "Квалификация", color: "#3B82F6", probability: 20 },
  { id: "proposal",    label: "Предложение",  color: "#8B5CF6", probability: 40 },
  { id: "negotiation", label: "Переговоры",   color: "#F59E0B", probability: 60 },
  { id: "won",         label: "Выиграна",     color: "#10B981", probability: 100 },
  { id: "lost",        label: "Проиграна",    color: "#EF4444", probability: 0 },
] as const

export type DealStageId = (typeof DEAL_STAGES)[number]["id"]

export const DEAL_PRIORITIES = [
  { id: "low",    label: "Низкий",   color: "#6B7280" },
  { id: "medium", label: "Средний",  color: "#F59E0B" },
  { id: "high",   label: "Высокий",  color: "#EF4444" },
] as const

export type DealPriority = (typeof DEAL_PRIORITIES)[number]["id"]

export const DEAL_SOURCES = [
  "Сайт",
  "Звонок",
  "Email",
  "Реферал",
  "hh.ru",
  "Выставка",
  "Соцсети",
  "Другое",
] as const

export function getStageByid(id: string) {
  return DEAL_STAGES.find((s) => s.id === id)
}

export function getPriorityById(id: string) {
  return DEAL_PRIORITIES.find((p) => p.id === id)
}
