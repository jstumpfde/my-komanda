// ── Воронка v2 — модель «стадий» (FUNNEL-V2.md) ──────────────────────────────
// Стадия 1 = Портрет (скан резюме) — НЕ хранится здесь, рендерится read-only из
// spec. В `stages` хранятся стадии 2…N (редактируемый путь кандидата).
// Хранение: vacancy.descriptionJson.funnelV2 (jsonb, без миграции).
// Фаза 1 — КОНСТРУКТОР (настраиваешь и видишь); рантайм (исполнение) — позже.

import { buildDozhimChain } from "./dozhim-templates"
import type { DripTemplates } from "@/lib/db/schema"

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

/** Цепочка касаний ветки А («не открыл/не начал») — унифицированные шаблоны на
 *  переменных, этап подставляется через STEP_WORDS (бриф Юрия 27.06,
 *  lib/funnel-v2/dozhim-templates.ts). */
export function dozhimChainFor(preset: DozhimPreset, action?: StageActionType, templates?: DripTemplates): DozhimTouch[] {
  return buildDozhimChain(action, preset, "A", templates)
}

/** Цепочка касаний ветки Б («открыл, но не завершил») — для dozhimChainOpened.
 *  Пустая для живых этапов (verb_done=null: interview/offer). */
export function dozhimChainForOpened(preset: DozhimPreset, action?: StageActionType, templates?: DripTemplates): DozhimTouch[] {
  return buildDozhimChain(action, preset, "B", templates)
}

/** Статусы hh/Avito (маппинг «вход в стадию → статус»). Сработает при рантайме. */
export const STAGE_STATUSES = ["новый", "первичный контакт", "интервью", "тестовое задание", "оффер", "принят", "отказ"]

/** Маппинг STAGE_STATUSES → действие hh-воронки (решение Юрия 26.06):
 *   первичный контакт → invitation (phone_interview) · тестовое задание → assessment
 *   интервью → interview · отказ → discard · остальные (новый/оффер/принят) → null (не менять).
 *  null = текст уходит, но hh-папка кандидата не трогается. */
export function hhActionForStatus(
  status?: string | null,
): "invitation" | "assessment" | "interview" | "discard" | null {
  const t = (status ?? "").toLowerCase()
  if (!t) return null
  if (t.includes("отказ")) return "discard"
  if (t.includes("тест")) return "assessment"
  if (t.includes("интервью")) return "interview"
  if (t.includes("первичн") || t.includes("контакт")) return "invitation"
  return null
}

/** Правило прохода стадии. Решение (включён ли авто-отказ/приглашение, порог) —
 *  ВНУТРИ стадии; общие дефолты (задержка, шаблоны) — наследуются из библиотеки. */
export interface StageRule {
  autoAdvance: boolean        // авто-приглашение прошедших на след. стадию
  autoReject: boolean         // авто-отказ не прошедших
  threshold?: number          // порог AI-балла (0–100; если AI-вопросов нет — по итоговому баллу, backward-compat)
  objThreshold?: number       // порог правильных ответов (0–100; объективные вопросы: single/multiple/yesno/sort)
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
  // Две ветки дожима на стадию (решение Юрия 26.06):
  //   dozhimChain        — «не открыл» (кандидат не открыл демо/тест стадии);
  //   dozhimChainOpened  — «открыл, но не досмотрел/не заполнил» (переключается
  //                        по событию открытия — switchV2BranchOpened).
  // Если dozhimChainOpened пуст — после открытия ветка просто отменяется (как сейчас).
  dozhimChain?: DozhimTouch[]
  dozhimChainOpened?: DozhimTouch[]
  hhStatus?: string               // статус hh при входе в стадию
  reminders?: StageReminders      // только для стадий-встреч

  // ── Template-time метаданные (apply.ts) ──────────────────────────────────
  // Используются ТОЛЬКО при применении шаблона роли к вакансии.
  // Рантайм (resolve-content, stage-completion-handler) их игнорирует:
  // к моменту исполнения contentBlockId уже проставлен apply.ts-ом.
  // Хранятся в funnelV2Template стадиях (jsonb в role_templates), в
  // descriptionJson.funnelV2.stages НЕ попадают (apply зачищает их при записи).

  /** id шаблона демо (demo_templates), секции которого нужно развернуть в
   *  demos-запись для ЭТОЙ стадии. Если null/undefined — для demo-стадии
   *  используется role.demoTemplateId (стандартный, одноволновой путь). */
  _demoTemplateId?: string | null

  /** id шаблона анкеты (questionnaire_templates), вопросы которого нужно
   *  завернуть в task-блок demos-записи для ЭТОЙ стадии.
   *  Если null/undefined — для prequalification/test-стадии используется
   *  role.questionnaireTemplateId (одноволновой путь). */
  _questionnaireTemplateId?: string | null
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
    dozhimChainOpened: dozhimChainForOpened("standard", action),
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
          objThreshold: typeof st.rule?.objThreshold === "number" ? st.rule.objThreshold : undefined,
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
