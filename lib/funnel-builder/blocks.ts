// Метаданные блоков конструктора воронки (MVP — 5 блоков).
// Хардкод — не в БД, чтобы менять label/icon без миграций.
// В БД (funnel_config_json) лежит только { type, order, enabled }.

import {
  Bot,
  ClipboardList,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react"

export type FunnelBlockType =
  | "first_message"
  | "demo"
  | "anketa"
  | "dozhim"
  | "ai_chatbot"

export interface FunnelBlockMeta {
  type:             FunnelBlockType
  label:            string
  description:      string
  icon:             LucideIcon
  required:         boolean
  incompatibleWith: FunnelBlockType[]
}

export const BLOCK_META: Record<FunnelBlockType, FunnelBlockMeta> = {
  first_message: {
    type:             "first_message",
    label:            "Первое сообщение",
    description:      "Серия приветственных сообщений с demo-ссылкой",
    icon:             MessageCircle,
    required:         true,
    incompatibleWith: [],
  },
  demo: {
    type:             "demo",
    label:            "Демонстрация",
    description:      "Презентация вакансии — кандидат смотрит видео и материалы",
    icon:             PlayCircle,
    required:         true,
    incompatibleWith: [],
  },
  anketa: {
    type:             "anketa",
    label:            "Анкета",
    description:      "Сбор данных кандидата после демо",
    icon:             ClipboardList,
    required:         true,
    incompatibleWith: [],
  },
  dozhim: {
    type:             "dozhim",
    label:            "Дожим",
    description:      "Серия напоминаний кандидатам, которые не дошли до конца",
    icon:             RotateCcw,
    required:         false,
    incompatibleWith: [],
  },
  ai_chatbot: {
    type:             "ai_chatbot",
    label:            "AI чат-бот",
    description:      "AI-агент общается с кандидатами вместо обычных сообщений",
    icon:             Bot,
    required:         false,
    incompatibleWith: ["first_message", "dozhim"],
  },
}

export const BLOCK_TYPES: FunnelBlockType[] = [
  "first_message",
  "demo",
  "anketa",
  "dozhim",
  "ai_chatbot",
]

export interface FunnelBlock {
  type:    FunnelBlockType
  order:   number
  enabled: boolean
}

export interface FunnelConfig {
  blocks: FunnelBlock[]
}

// Конфигурация по умолчанию: все обязательные блоки включены,
// опциональные — выключены. Используется когда vacancy.funnel_config_json
// ещё пустой ({ "blocks": [] }), чтобы UI не показывал пустоту.
export function getDefaultFunnelConfig(): FunnelConfig {
  return {
    blocks: [
      { type: "first_message", order: 1, enabled: true  },
      { type: "demo",          order: 2, enabled: true  },
      { type: "anketa",        order: 3, enabled: true  },
      { type: "dozhim",        order: 4, enabled: true  },
      { type: "ai_chatbot",    order: 5, enabled: false },
    ],
  }
}

// Нормализация: дополняем недостающие блоки дефолтами + сортируем по order.
export function normalizeFunnelConfig(raw: unknown): FunnelConfig {
  const defaults = getDefaultFunnelConfig()
  const blocksRaw = (raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown }).blocks))
    ? (raw as { blocks: unknown[] }).blocks
    : []

  const byType = new Map<FunnelBlockType, FunnelBlock>()
  for (const b of blocksRaw) {
    if (!b || typeof b !== "object") continue
    const obj = b as { type?: unknown; order?: unknown; enabled?: unknown }
    if (typeof obj.type !== "string") continue
    if (!(obj.type in BLOCK_META)) continue
    const type = obj.type as FunnelBlockType
    byType.set(type, {
      type,
      order:   typeof obj.order === "number" ? obj.order : (BLOCK_TYPES.indexOf(type) + 1),
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    })
  }
  // Гарантируем наличие всех известных типов (если в БД их ещё нет).
  for (const d of defaults.blocks) {
    if (!byType.has(d.type)) byType.set(d.type, d)
  }
  const blocks = Array.from(byType.values()).sort((a, b) => a.order - b.order)
  // Перенумеровываем подряд от 1 чтобы значения order были чистыми.
  blocks.forEach((b, idx) => { b.order = idx + 1 })
  return { blocks }
}

// Валидация: обязательные блоки должны быть enabled=true.
export function validateFunnelConfig(cfg: FunnelConfig): string | null {
  for (const b of cfg.blocks) {
    const meta = BLOCK_META[b.type]
    if (!meta) continue
    if (meta.required && !b.enabled) {
      return `Блок «${meta.label}» обязательный, его нельзя выключить`
    }
  }
  return null
}
