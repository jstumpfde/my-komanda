// Метаданные блоков конструктора воронки.
// Хардкод — не в БД, чтобы менять label/icon/доступность без миграций.
// В БД (funnel_config_json) лежит только { type, order, enabled }.

import {
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  Filter,
  MessageCircle,
  Phone,
  PlayCircle,
  Repeat,
  ShieldAlert,
  Sparkles,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react"

export type FunnelBlockType =
  | "ai_resume_score"
  | "stop_factors_resume"
  | "first_message"
  | "prequalification"
  | "demo"
  | "anketa"
  | "ai_anketa_score"
  | "auto_reply_test_task"
  | "stop_words_chat"
  | "dozhim"
  | "ai_chatbot"
  | "interview"
  | "thank_you_screen"
  | "video_intro"
  | "test_task"
  | "reference_check"
  | "offer"

export interface FunnelBlockMeta {
  type:             FunnelBlockType
  label:            string
  description:      string
  icon:             LucideIcon
  required:         boolean
  incompatibleWith: FunnelBlockType[]
}

export const BLOCK_META: Record<FunnelBlockType, FunnelBlockMeta> = {
  ai_resume_score: {
    type:             "ai_resume_score",
    label:            "AI-скоринг резюме",
    description:      "AI оценивает резюме при импорте 0–100",
    icon:             Brain,
    required:         false,
    incompatibleWith: [],
  },
  stop_factors_resume: {
    type:             "stop_factors_resume",
    label:            "Стоп-факторы по резюме",
    description:      "Город / опыт / возраст → автоотказ",
    icon:             Filter,
    required:         false,
    incompatibleWith: [],
  },
  first_message: {
    type:             "first_message",
    label:            "Первое сообщение",
    description:      "Серия приветственных сообщений с demo-ссылкой",
    icon:             MessageCircle,
    required:         true,
    incompatibleWith: [],
  },
  prequalification: {
    type:             "prequalification",
    label:            "Предквалификация",
    description:      "AI-опрос перед демо для отсева",
    icon:             ClipboardList,
    required:         false,
    incompatibleWith: [],
  },
  demo: {
    type:             "demo",
    label:            "Демонстрация",
    description:      "Видео-обзор должности и материалы",
    icon:             PlayCircle,
    required:         true,
    incompatibleWith: [],
  },
  anketa: {
    type:             "anketa",
    label:            "Анкета",
    description:      "Финальная анкета кандидата после демо",
    icon:             FileText,
    required:         true,
    incompatibleWith: [],
  },
  ai_anketa_score: {
    type:             "ai_anketa_score",
    label:            "AI-скрининг анкеты",
    description:      "AI оценивает ответы кандидата 0–100",
    icon:             Sparkles,
    required:         false,
    incompatibleWith: [],
  },
  auto_reply_test_task: {
    type:             "auto_reply_test_task",
    label:            "Автоответ с тест. заданием",
    description:      "Сообщение через N минут после анкеты",
    icon:             Zap,
    required:         false,
    incompatibleWith: [],
  },
  stop_words_chat: {
    type:             "stop_words_chat",
    label:            "Стоп-слова в чате",
    description:      "Триггер автоотказа по словам кандидата",
    icon:             ShieldAlert,
    required:         false,
    incompatibleWith: [],
  },
  dozhim: {
    type:             "dozhim",
    label:            "Дожим",
    description:      "Цепочка касаний для не-открывших и не-завершивших",
    icon:             Repeat,
    required:         false,
    incompatibleWith: [],
  },
  ai_chatbot: {
    type:             "ai_chatbot",
    label:            "AI чат-бот",
    description:      "AI-агент общается с кандидатами вместо обычных сообщений",
    icon:             Bot,
    required:         false,
    incompatibleWith: ["first_message", "dozhim", "auto_reply_test_task"],
  },
  interview: {
    type:             "interview",
    label:            "Интервью",
    description:      "Приглашение на встречу",
    icon:             Calendar,
    required:         true,
    incompatibleWith: [],
  },
  thank_you_screen: {
    type:             "thank_you_screen",
    label:            "Финальный экран",
    description:      "Спасибо-экран после прохождения воронки",
    icon:             CheckCircle2,
    required:         true,
    incompatibleWith: [],
  },
  video_intro: {
    type:             "video_intro",
    label:            "Видео-визитка",
    description:      "Кандидат снимает короткое видео о себе",
    icon:             Video,
    required:         false,
    incompatibleWith: [],
  },
  test_task: {
    type:             "test_task",
    label:            "Тестовое задание",
    description:      "Отдельная ступень: задание → ответ → AI-проверка",
    icon:             ClipboardCheck,
    required:         false,
    incompatibleWith: [],
  },
  reference_check: {
    type:             "reference_check",
    label:            "Реф-чек",
    description:      "Звонок предыдущему работодателю кандидата",
    icon:             Phone,
    required:         false,
    incompatibleWith: [],
  },
  offer: {
    type:             "offer",
    label:            "Оффер",
    description:      "Генерация документа об оффере + электронная подпись",
    icon:             FileSignature,
    required:         false,
    incompatibleWith: [],
  },
}

export const BLOCK_TYPES: FunnelBlockType[] = [
  "ai_resume_score",
  "stop_factors_resume",
  "first_message",
  "prequalification",
  "demo",
  "video_intro",
  "anketa",
  "ai_anketa_score",
  "auto_reply_test_task",
  "test_task",
  "stop_words_chat",
  "dozhim",
  "ai_chatbot",
  "interview",
  "reference_check",
  "offer",
  "thank_you_screen",
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
// типичные опциональные — выключены. Используется когда vacancy.funnel_config_json
// ещё пустой ({ "blocks": [] }), чтобы UI не показывал пустоту.
//
// Также используется при normalizeFunnelConfig() для дополнения недостающих
// блоков — что важно после расширения списка типов: старые вакансии с 5
// блоками в БД будут автоматически дополнены новыми типами при чтении.
export function getDefaultFunnelConfig(): FunnelConfig {
  const defaultsByType: Partial<Record<FunnelBlockType, boolean>> = {
    first_message:    true,
    demo:             true,
    anketa:           true,
    interview:        true,
    thank_you_screen: true,
    dozhim:           true,
    // Прочее — false (опционально, HR включит через UI).
  }
  return {
    blocks: BLOCK_TYPES.map((type, idx) => ({
      type,
      order:   idx + 1,
      enabled: Boolean(defaultsByType[type] ?? BLOCK_META[type].required),
    })),
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

// Шаблоны воронок: пресеты для быстрого старта.
// При применении: enabled = enabledBlocks.includes(type) (плюс required всегда true),
// порядок берётся из BLOCK_TYPES (дефолтный). Конфликты по incompatibleWith —
// разрешаются автоматически (приоритет — тому что в шаблоне явно указано).

export interface FunnelTemplate {
  name:           string
  description:    string
  enabledBlocks:  FunnelBlockType[]
}

export const FUNNEL_TEMPLATES: Record<string, FunnelTemplate> = {
  simple: {
    name:        "Простой найм",
    description: "Базовый сценарий: сообщение → демо → анкета → интервью",
    enabledBlocks: [
      "first_message",
      "demo",
      "anketa",
      "interview",
      "thank_you_screen",
    ],
  },
  with_test: {
    name:        "С тестовым заданием",
    description: "AI-отсев + тестовое после анкеты",
    enabledBlocks: [
      "ai_resume_score",
      "stop_factors_resume",
      "first_message",
      "demo",
      "anketa",
      "ai_anketa_score",
      "auto_reply_test_task",
      "interview",
      "thank_you_screen",
    ],
  },
  with_chatbot: {
    name:        "С AI чат-ботом",
    description: "AI-агент вместо обычных сообщений",
    enabledBlocks: [
      "ai_resume_score",
      "demo",
      "anketa",
      "ai_chatbot",
      "interview",
      "thank_you_screen",
    ],
  },
  full: {
    name:        "Полный сценарий",
    description: "Все возможности (кроме взаимоисключающих с AI чат-ботом)",
    enabledBlocks: [
      "ai_resume_score",
      "stop_factors_resume",
      "first_message",
      "prequalification",
      "demo",
      "anketa",
      "ai_anketa_score",
      "auto_reply_test_task",
      "stop_words_chat",
      "dozhim",
      "interview",
      "thank_you_screen",
    ],
  },
  full_with_test: {
    name:        "Полный с тестовым",
    description: "С видео-визиткой, тестовым заданием и реф-чеком",
    enabledBlocks: [
      "ai_resume_score",
      "first_message",
      "demo",
      "video_intro",
      "anketa",
      "test_task",
      "reference_check",
      "interview",
      "offer",
      "thank_you_screen",
    ],
  },
}

// Применить шаблон к существующему набору блоков: оставляем тот же набор
// типов (все 13), включаем только те что в template.enabledBlocks или required.
// При конфликте по incompatibleWith — отключаем конфликтующие.
export function applyFunnelTemplate(
  template:        FunnelTemplate,
  currentBlocks?:  FunnelBlock[],  // зарезервировано — сейчас не используем
): FunnelBlock[] {
  void currentBlocks
  const targetEnabled = new Set<FunnelBlockType>(template.enabledBlocks)
  // Required всегда включены.
  for (const t of BLOCK_TYPES) {
    if (BLOCK_META[t].required) targetEnabled.add(t)
  }
  // Снять конфликты: если включён блок с incompatibleWith — выкл всё что в списке.
  for (const t of Array.from(targetEnabled)) {
    const meta = BLOCK_META[t]
    if (!meta) continue
    for (const conflict of meta.incompatibleWith) {
      // Required — приоритетнее (не выключаем required даже из-за конфликта).
      if (BLOCK_META[conflict]?.required) continue
      targetEnabled.delete(conflict)
    }
  }
  return BLOCK_TYPES.map((type, idx) => ({
    type,
    order:   idx + 1,
    enabled: targetEnabled.has(type),
  }))
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
