// ── Воронка v2 — модель «стадий» (FUNNEL-V2.md) ──────────────────────────────
// Стадия 1 = Портрет (скан резюме) — НЕ хранится здесь, рендерится read-only из
// spec. В `stages` хранятся стадии 2…N (редактируемый путь кандидата).
// Хранение: vacancy.descriptionJson.funnelV2 (jsonb, без миграции).
// Фаза 1 — КОНСТРУКТОР (настраиваешь и видишь); рантайм (исполнение) — позже.

import { buildDozhimChain } from "./dozhim-templates"
import type { DripTemplates } from "@/lib/db/schema"
import { hhStatusStringToHhAction } from "@/lib/hh/stage-mapping"
import type { StageColor } from "@/lib/stages"

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
  // Делегируем центральному модулю маппинга (lib/hh/stage-mapping.ts), чтобы
  // исходящий пуш v2 шёл через единую утверждённую карту стадий (#16/#23).
  // "consider" в v2-статусах не используется → сузим тип до legacy-набора.
  const a = hhStatusStringToHhAction(status)
  return a === "consider" ? null : a
}

// ── Гейт по баллу (Фаза 1в) ──────────────────────────────────────────────────
// Отдельное авто-правило «прохода по баллу»: при завершении стадии сравнить балл
// нужного типа с порогом и, если не набрал, применить failAction.
//
// КРИТИЧНО: гейт срабатывает ТОЛЬКО при autoEnabled === true. У всех
// существующих/легаси стадий scoreGate отсутствует (или autoEnabled=false) —
// значит по умолчанию НИЧЕГО не меняется (ручной разбор, как и было).


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
  scoreGate?: ScoreGate       // правило прохода по баллу (Фаза 1а — модель; рантайм подключит позже)
}

/** С какого скоринга берём балл для гейта стадии.
 *  resume — балл AI-резюме (Портрет), anketa — анкета/предквал, block2 — 2-я
 *  часть (путь менеджера), test — тест-задание, portrait — итог Портрета. */
export type ScoreGateType = "resume" | "anketa" | "block2" | "test" | "portrait"

/** Что делать с не прошедшими порог: предварительный отказ (обратимый),
 *  ручное решение HR, жёсткий отказ, или «в резерв» (talent pool — кандидат не
 *  набрал балл, но не отказываем, а откладываем в резерв). */
export type ScoreGateFailAction = "preliminary_reject" | "manual" | "reject" | "reserve"

/** Правило прохода стадии по баллу. autoEnabled=false по умолчанию —
 *  без явного включения ничего НЕ гейтится автоматически (обратная
 *  совместимость: действующие вакансии не меняют поведение). */
export interface ScoreGate {
  scoreType:  ScoreGateType
  threshold:  number           // 0–100, дефолт 50
  failAction: ScoreGateFailAction
  autoEnabled: boolean         // дефолт false — авто-гейт выключен
}

export const DEFAULT_SCORE_GATE_THRESHOLD = 50
export const SCORE_GATE_TYPES: ScoreGateType[] = ["resume", "anketa", "block2", "test", "portrait"]
export const SCORE_GATE_FAIL_ACTIONS: ScoreGateFailAction[] = ["preliminary_reject", "manual", "reject", "reserve"]

export interface StageReminders {
  dayBefore: boolean   // за сутки
  morning: boolean     // утром в день встречи
  hourBefore?: boolean // за ~час до встречи (#27)
}

export interface FunnelV2Stage {
  id: string
  action: StageActionType
  title?: string
  color?: StageColor    // цвет бейджа стадии (реестр стадий воронки v2)
  negative?: boolean    // негативная/отказная стадия (напр. предв. отказ)
  terminal?: boolean    // терминальная стадия (из неё нет автоперехода дальше)
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
    base.reminders = { dayBefore: true, morning: true, hourBefore: true }
  }
  return base
}

/** Нормализовать scoreGate стадии (терпимо к старым/битым данным).
 *  undefined на входе → undefined (гейта нет). Дефолты только для заданного
 *  объекта: threshold=50, failAction='preliminary_reject', autoEnabled=false. */
export function normalizeScoreGate(raw: unknown): ScoreGate | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const g = raw as Partial<ScoreGate>
  const scoreType: ScoreGateType = SCORE_GATE_TYPES.includes(g.scoreType as ScoreGateType)
    ? (g.scoreType as ScoreGateType)
    : "resume"
  const threshold = typeof g.threshold === "number" && Number.isFinite(g.threshold)
    ? Math.max(0, Math.min(100, g.threshold))
    : DEFAULT_SCORE_GATE_THRESHOLD
  const failAction: ScoreGateFailAction = SCORE_GATE_FAIL_ACTIONS.includes(g.failAction as ScoreGateFailAction)
    ? (g.failAction as ScoreGateFailAction)
    : "preliminary_reject"
  return { scoreType, threshold, failAction, autoEnabled: g.autoEnabled === true }
}

const STAGE_COLORS: StageColor[] = [
  "slate", "blue", "indigo", "violet", "purple", "amber",
  "orange", "yellow", "lime", "green", "emerald", "rose", "red",
]

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
        color: STAGE_COLORS.includes(st.color as StageColor) ? st.color : undefined,
        negative: st.negative === true ? true : undefined,
        terminal: st.terminal === true ? true : undefined,
        rule: {
          autoAdvance: st.rule?.autoAdvance === true,
          autoReject: st.rule?.autoReject === true,
          threshold: typeof st.rule?.threshold === "number" ? st.rule.threshold : undefined,
          objThreshold: typeof st.rule?.objThreshold === "number" ? st.rule.objThreshold : undefined,
          rejectDelayMinutes: typeof st.rule?.rejectDelayMinutes === "number" ? st.rule.rejectDelayMinutes : DEFAULT_REJECT_DELAY_MIN,
          passCriteria: typeof st.rule?.passCriteria === "string" ? st.rule.passCriteria : undefined,
          advanceTo: typeof st.rule?.advanceTo === "string" ? st.rule.advanceTo : undefined,
          rejectText: typeof st.rule?.rejectText === "string" ? st.rule.rejectText : undefined,
          scoreGate: normalizeScoreGate(st.rule?.scoreGate),
        },
        dozhim: (["off", "soft", "standard", "strong"] as DozhimPreset[]).includes(st.dozhim) ? st.dozhim : "standard",
      }
    }),
  }
}

// ── Дефолт-шаблон воронки v2 (инициализация пустой воронки) ───────────────────
// Разумный набор стадий пути продаж. ВСЕ scoreGate.autoEnabled=false — при
// инициализации ничего не гейтится автоматически (обратная совместимость,
// поведение действующих вакансий не меняется). Подключит UI-фаза при создании
// пустой воронки; рантайм включит гейты только когда HR включит autoEnabled.

/** Проставить scoreGate на стадию (autoEnabled всегда false в дефолт-шаблоне). */
function withScoreGate(stage: FunnelV2Stage, scoreType: ScoreGateType, threshold = DEFAULT_SCORE_GATE_THRESHOLD): FunnelV2Stage {
  stage.rule.scoreGate = { scoreType, threshold, failAction: "preliminary_reject", autoEnabled: false }
  return stage
}

/**
 * Дефолтный набор стадий воронки v2 для пустой воронки (путь продаж):
 *   Отклик → скан резюме [gate resume] · Демо (1-я часть) · Путь менеджера
 *   (2-я часть) [gate anketa] · Тест-задание [gate test] · Интервью · Оффер ·
 *   Нанят.
 * Стадия 1 «Портрет» (скан резюме) хранится не здесь — она рендерится из spec.
 * Все gate — autoEnabled=false (ничего не отсеивается без явного включения HR).
 *
 * @param seed префикс для генерации id стадий (по умолчанию 'default').
 */
export function defaultFunnelV2Stages(seed = "default"): FunnelV2Stage[] {
  const s = (suffix: string) => `${seed}-${suffix}`

  // 1) Отклик — скан резюме (первое касание, gate по баллу AI-резюме)
  const respond = withScoreGate(makeStage("message", s("respond")), "resume")
  respond.title = "Отклик — скан резюме"

  // 2) Демо (1-я часть пути)
  const demo = makeStage("demo", s("demo"))
  demo.title = "Демо (1-я часть)"

  // 3) Путь менеджера (2-я часть) — анкета/предквалификация, gate по анкете
  const managerPath = withScoreGate(makeStage("prequalification", s("manager-path")), "anketa")
  managerPath.title = "Путь менеджера (2-я часть)"

  // 4) Тест-задание — gate по баллу теста
  const task = withScoreGate(makeStage("task", s("task")), "test")
  task.title = "Тест-задание"

  // 5) Интервью
  const interview = makeStage("interview", s("interview"))
  interview.title = "Интервью"

  // 6) Оффер
  const offer = makeStage("offer", s("offer"))
  offer.title = "Оффер"

  // 7) Нанят (терминальная позитивная)
  const hired = makeStage("hired", s("hired"))
  hired.title = "Нанят"
  hired.terminal = true
  hired.color = "green"

  return [respond, demo, managerPath, task, interview, offer, hired]
}
