// ── Воронка v2 — модель «стадий» (FUNNEL-V2.md) ──────────────────────────────
// Стадия 1 = Портрет (скан резюме) — НЕ хранится здесь, рендерится read-only из
// spec. В `stages` хранятся стадии 2…N (редактируемый путь кандидата).
// Хранение: vacancy.descriptionJson.funnelV2 (jsonb, без миграции).
// Фаза 1 — КОНСТРУКТОР (настраиваешь и видишь); рантайм (исполнение) — позже.

import { FOLLOWUP_PRESETS, type FollowUpPreset } from "@/lib/followup/presets"
import { DEFAULT_FOLLOWUP_NOT_OPENED, DEFAULT_TEST_NOT_OPENED } from "@/lib/followup/default-messages"

export type StageActionType =
  | "message"          // просто сообщение/касание
  | "prequalification" // AI-вопросы перед демо
  | "demo"             // демонстрация
  | "test"             // тест-вопросы
  | "task"             // тест-задание
  | "interview"        // встреча: телефон / zoom / офис
  | "offer"            // оффер + подпись
  | "security_check"   // СБ-проверка (Dadata)
  | "reference_check"  // реф-чек у прошлого работодателя
  | "hired"            // финал — «Нанят»

export const STAGE_ACTIONS: Array<{ type: StageActionType; label: string; icon: string; desc: string }> = [
  { type: "prequalification", label: "Предквалификация", icon: "clipboard-list", desc: "AI-вопросы для отсева" },
  { type: "demo",             label: "Демонстрация",     icon: "player-play",    desc: "видео-обзор + материалы" },
  { type: "test",             label: "Тест-вопросы",     icon: "list-check",     desc: "вопросы + AI-проверка" },
  { type: "task",             label: "Тест-задание",     icon: "clipboard-check",desc: "задание → ответ → проверка" },
  { type: "interview",        label: "Интервью",         icon: "calendar",       desc: "телефон / Zoom / офис" },
  { type: "offer",            label: "Оффер",            icon: "file-text",      desc: "оффер + подпись" },
  { type: "security_check",   label: "СБ-проверка",      icon: "shield-check",   desc: "проверки (Dadata)" },
  { type: "reference_check",  label: "Реф-чек",          icon: "phone",          desc: "отзыв прошлого работодателя" },
  { type: "message",          label: "Сообщение",        icon: "message",        desc: "касание/инфо без проверки" },
  { type: "hired",            label: "Нанят",            icon: "circle-check",   desc: "финал воронки" },
]

export type InterviewMode = "phone" | "zoom" | "office"
export type SchedulingMode = "bot" | "self_link" // согласование: бот в чате / ссылка-самозапись (оба по решению Юрия)
export type DozhimPreset = "off" | "soft" | "standard" | "strong"

export const DOZHIM_LABEL: Record<DozhimPreset, string> = {
  off: "Без дожима", soft: "Мягкий", standard: "Стандарт", strong: "Сильный",
}

/** Одно касание цепочки дожима — свой текст и через сколько дней слать. */
export interface DozhimTouch { text: string; delayDays: number }

// Маппинг пресета v2 → согласованный пресет дожима (lib/followup).
const PRESET_MAP: Record<DozhimPreset, FollowUpPreset> = { off: "off", soft: "soft", standard: "standard", strong: "aggressive" }

/** Цепочка касаний по пресету — РЕАЛЬНЫЕ согласованные тексты (lib/followup),
 *  с {{demo_link}}/{{test_link}}. Для тест-стадий — тексты по тесту. */
export function dozhimChainFor(preset: DozhimPreset, action?: StageActionType): DozhimTouch[] {
  const fp = FOLLOWUP_PRESETS[PRESET_MAP[preset]]
  if (!fp || fp.messageIndexes.length === 0) return []
  const texts = (action === "test" || action === "task") ? DEFAULT_TEST_NOT_OPENED : DEFAULT_FOLLOWUP_NOT_OPENED
  return fp.messageIndexes.map((mi, i) => ({ text: texts[mi] ?? "", delayDays: fp.days[i] ?? i + 1 }))
}

/** Статусы hh/Avito (маппинг «вход в стадию → статус»). Сработает при рантайме. */
export const STAGE_STATUSES = ["новый", "первичный контакт", "интервью", "тестовое задание", "оффер", "принят", "отказ"]

/** Правило прохода стадии. Решение (включён ли авто-отказ/приглашение, порог) —
 *  ВНУТРИ стадии; общие дефолты (задержка, шаблоны) — наследуются из библиотеки. */
export interface StageRule {
  autoAdvance: boolean        // авто-приглашение прошедших на след. стадию
  autoReject: boolean         // авто-отказ не прошедших
  threshold?: number          // порог балла (для скоринговых действий: test/task/prequalification)
  rejectDelayMinutes: number  // задержка отказа, дефолт 60 (наследуется, можно переопределить)
  passCriteria?: string       // критерий прохода (описательно / для AI)
  advanceTo?: string          // куда зовём прошедших: "next" (по умолч.) | id стадии (ветвление)
  rejectText?: string         // текст отказа (пресет/текст)
}

export interface StageReminders {
  dayBefore: boolean  // за сутки
  morning: boolean    // утром в день встречи
}

export interface FunnelV2Stage {
  id: string
  action: StageActionType
  title?: string
  // параметры действия «Интервью»
  interviewMode?: InterviewMode
  scheduling?: SchedulingMode[]   // оба варианта по умолчанию
  // ссылка на пресет сообщения (broadcastTemplates) или null
  messagePresetId?: string | null
  contentBlockId?: string | null  // подключённый блок из «Контента» (демо/тест)
  rule: StageRule
  dozhim: DozhimPreset
  dozhimChain?: DozhimTouch[]      // редактируемая цепочка касаний (тексты)
  hhStatus?: string               // статус hh при входе в стадию
  reminders?: StageReminders      // только для стадий-встреч
}

export interface FunnelV2Config {
  enabled: boolean
  stages: FunnelV2Stage[]   // стадии 2…N (стадия 1 = Портрет, рендерится отдельно)
}

export const DEFAULT_REJECT_DELAY_MIN = 60

export function emptyFunnelV2(): FunnelV2Config {
  return { enabled: false, stages: [] }
}

/** Дефолтная стадия для нового действия (разрешающее правило, дожим стандарт). */
export function makeStage(action: StageActionType, idSeed: string): FunnelV2Stage {
  const base: FunnelV2Stage = {
    id: `st-${idSeed}`,
    action,
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: DEFAULT_REJECT_DELAY_MIN,
    },
    dozhim: "standard",
    dozhimChain: dozhimChainFor("standard", action),
    messagePresetId: null,
    contentBlockId: null,
  }
  if (action === "interview") {
    base.interviewMode = "phone"
    base.scheduling = ["bot", "self_link"]
    base.reminders = { dayBefore: true, morning: true }
  }
  return base
}

/** Безопасная нормализация прочитанного из БД (терпимо к старым/битым данным). */
export function normalizeFunnelV2(raw: unknown): FunnelV2Config {
  if (!raw || typeof raw !== "object") return emptyFunnelV2()
  const r = raw as Partial<FunnelV2Config>
  const stages = Array.isArray(r.stages) ? r.stages.filter(s => s && typeof s === "object" && (s as FunnelV2Stage).id) : []
  return {
    enabled: r.enabled === true,
    stages: stages.map((s) => {
      const st = s as FunnelV2Stage
      return {
        ...st,
        rule: {
          autoAdvance: st.rule?.autoAdvance === true,
          autoReject: st.rule?.autoReject === true,
          threshold: typeof st.rule?.threshold === "number" ? st.rule.threshold : undefined,
          rejectDelayMinutes: typeof st.rule?.rejectDelayMinutes === "number" ? st.rule.rejectDelayMinutes : DEFAULT_REJECT_DELAY_MIN,
          passCriteria: typeof st.rule?.passCriteria === "string" ? st.rule.passCriteria : undefined,
          advanceTo: typeof st.rule?.advanceTo === "string" ? st.rule.advanceTo : undefined,
          rejectText: typeof st.rule?.rejectText === "string" ? st.rule.rejectText : undefined,
        },
        dozhim: (["off", "soft", "standard", "strong"] as DozhimPreset[]).includes(st.dozhim) ? st.dozhim : "standard",
      }
    }),
  }
}
