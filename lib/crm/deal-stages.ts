// Одна стадия воронки (формат хранения в sales_settings.stages).
export interface CrmStage {
  id: string
  label: string
  color: string       // hex
  probability: number // 0..100
  order: number
}

// Тип воронки: продажи времени (запись) vs классическая B2B-сделка.
export type FunnelType = "booking" | "b2b"

export const FUNNEL_TYPES: { id: FunnelType; label: string; description: string }[] = [
  { id: "booking", label: "Воронка записи", description: "Лид → квалификация → слот → запись → визит (продажи времени)" },
  { id: "b2b",     label: "B2B-сделка",     description: "Новая → переговоры → выиграна/проиграна (продажа продукта/подписки)" },
]

// ── Дефолтные наборы стадий под каждый тип воронки ──
export const DEFAULT_B2B_STAGES: CrmStage[] = [
  { id: "new",         label: "Новая",        color: "#6B7280", probability: 10,  order: 0 },
  { id: "qualifying",  label: "Квалификация", color: "#3B82F6", probability: 20,  order: 1 },
  { id: "proposal",    label: "Предложение",  color: "#8B5CF6", probability: 40,  order: 2 },
  { id: "negotiation", label: "Переговоры",   color: "#F59E0B", probability: 60,  order: 3 },
  { id: "won",         label: "Выиграна",     color: "#10B981", probability: 100, order: 4 },
  { id: "lost",        label: "Проиграна",    color: "#EF4444", probability: 0,   order: 5 },
]

export const DEFAULT_BOOKING_STAGES: CrmStage[] = [
  { id: "lead",         label: "Новый лид",    color: "#6B7280", probability: 10,  order: 0 },
  { id: "qualifying",   label: "Квалификация", color: "#3B82F6", probability: 25,  order: 1 },
  { id: "slot_offered", label: "Слот предложен", color: "#8B5CF6", probability: 50, order: 2 },
  { id: "booked",       label: "Записан",      color: "#F59E0B", probability: 75,  order: 3 },
  { id: "showed",       label: "Пришёл",       color: "#10B981", probability: 100, order: 4 },
  { id: "no_show",      label: "Не пришёл",    color: "#EF4444", probability: 0,   order: 5 },
  { id: "lost",         label: "Отказ",        color: "#9CA3AF", probability: 0,   order: 6 },
]

// Дефолтные стадии по типу воронки. Используется как fallback, когда у тенанта
// в sales_settings.stages ещё нет своего набора.
export function getDefaultStages(funnelType: FunnelType): CrmStage[] {
  return funnelType === "b2b" ? DEFAULT_B2B_STAGES : DEFAULT_BOOKING_STAGES
}

// Нормализовать произвольный массив (из БД) к CrmStage[] с сортировкой по order.
export function normalizeStages(raw: unknown, funnelType: FunnelType): CrmStage[] {
  if (!Array.isArray(raw) || raw.length === 0) return getDefaultStages(funnelType)
  return (raw as Partial<CrmStage>[])
    .filter((s) => s && typeof s.id === "string" && typeof s.label === "string")
    .map((s, i) => ({
      id: s.id as string,
      label: s.label as string,
      color: s.color ?? "#6B7280",
      probability: typeof s.probability === "number" ? s.probability : 0,
      order: typeof s.order === "number" ? s.order : i,
    }))
    .sort((a, b) => a.order - b.order)
}

// Старый хардкод оставлен для обратной совместимости существующих импортов
// (deals/pipeline страницы) — равен дефолту B2B. Новый код берёт стадии из
// sales_settings через getDefaultStages/normalizeStages.
export const DEAL_STAGES = DEFAULT_B2B_STAGES

export type DealStageId = string

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
