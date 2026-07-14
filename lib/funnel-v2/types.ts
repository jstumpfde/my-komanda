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
  | "decision"         // финальное решение по кандидату (перед оффером)
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
  { type: "decision",         label: "Решение",          icon: "circle-check",   desc: "финальное решение по кандидату" },
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

/** Маппинг STAGE_STATUSES → действие hh-воронки (решение Юрия 26.06, поправка 05.07):
 *   первичный контакт → invitation (phone_interview) · тестовое задание → assessment
 *   интервью → interview · отказ → discard · принят → hired (у hh ЕСТЬ состояние
 *   "Выход на работу", проверено 05.07 через api.hh.ru/dictionaries — правит
 *   ошибочное допущение 26.06) · оффер/новый → null (не менять).
 *  null = текст уходит, но hh-папка кандидата не трогается. */
export function hhActionForStatus(
  status?: string | null,
): "invitation" | "assessment" | "interview" | "discard" | "hired" | null {
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
  rejectText?: string         // текст сообщения при непрохождении (отказ/предв.отказ/резерв)
  failNotify?: boolean        // слать ли rejectText кандидату при непрохождении гейта (можно молча увести на стадию)
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

/** Что делать с «жёлтой» (средней) зоной трёхзонного гейта (Воронка 3):
 *  manual_review — ручной разбор HR (дефолт), prequalification — отправить
 *  кандидата на стадию предквалификации (доп. AI-вопросы). */
export type ScoreGateMiddleAction = "manual_review" | "prequalification"

/** Правило прохода стадии по баллу. autoEnabled=false по умолчанию —
 *  без явного включения ничего НЕ гейтится автоматически (обратная
 *  совместимость: действующие вакансии не меняют поведение).
 *
 *  Три зоны (Воронка 3, аддитивно): если задан thresholdLower —
 *    score ≥ threshold        → зелёная зона, дальше;
 *    score <  thresholdLower  → красная зона: отказ, если autoRejectRed===true,
 *                               иначе ручной разбор с пометкой;
 *    между ними               → жёлтая зона: middleAction (дефолт manual_review).
 *  thresholdLower не задан → прежнее двухзонное поведение (единственный threshold). */
export interface ScoreGate {
  scoreType:  ScoreGateType
  threshold:  number           // 0–100, дефолт 50 (верхний порог в трёхзонном режиме)
  failAction: ScoreGateFailAction
  autoEnabled: boolean         // дефолт false — авто-гейт выключен
  thresholdLower?: number      // нижний порог (0–100, ≤ threshold); задан → три зоны
  middleAction?: ScoreGateMiddleAction // жёлтая зона; отсутствует = manual_review
  autoRejectRed?: boolean      // дефолт false — красная зона НЕ авто-режется
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
  /** Стадия включена? undefined/true = включена; false = выключена — рантайм
   *  пропускает её (кандидат проскакивает на следующую включённую). */
  enabled?: boolean
  /** Текст отказа стадии (Воронка 3). Приоритетнее rule.rejectText; пусто →
   *  действующий источник (rule.rejectText → стандартный текст вакансии). */
  rejectText?: string
  /** Текст прощания стадии (Воронка 3). Хранится в конфиге; пусто → ничего. */
  farewellText?: string
  // параметры действия «Интервью»
  interviewMode?: InterviewMode
  scheduling?: SchedulingMode[]   // оба варианта по умолчанию
  // ссылка на пресет сообщения (broadcastTemplates) или null
  // УСТАРЕВШЕЕ (не удалять — старые записи): единственный текст сообщения.
  // Актуальное хранилище — `messages` ниже; читать через эффективный список
  // `stage.messages ?? (stage.messagePresetId ? [stage.messagePresetId] : [])`.
  messagePresetId?: string | null
  /** Упорядоченный список текстов сообщений стадии (замена messagePresetId).
   *  undefined → эффективный список читаем из messagePresetId (см. выше). */
  messages?: string[]
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
  avitoStatus?: string            // статус Avito при входе в стадию (отдельно от hh)
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

// ── Нативные поля Стадии 1 «Отклик → приглашение» (перенос из Портрета, 14.07) ──
// Стадия 1 = Портрет и НЕ входит в stages[] (её отдельная стадия убрана 13.07),
// поэтому её поведенческие поля живут на уровне конфига. Здесь — ТОЛЬКО те
// поведения, что дизайн переносит в рантайм: задержка первого сообщения,
// нерабочее время, текст авто-отказа и задержка отказа. Пороги/авто-приглашение
// по баллу и текст приглашения остаются в Портрете (модель скоринга) / в
// сообщениях первой реальной стадии. Все поля опциональны: отсутствие = «ещё не
// настроено нативно» (рантайм берёт дефолт; UI предзаполнит из Портрета один раз).
export interface FunnelV2Stage1 {
  /** Задержка «человеческой» паузы перед первым сообщением, сек. */
  inviteDelaySeconds?: number
  /** Слать ли мягкое подтверждение в нерабочее время (иначе откладываем до утра). */
  offHoursEnabled?: boolean
  /** Пауза перед мягким подтверждением в нерабочее время, сек. */
  offHoursDelaySeconds?: number
  /** Текст мягкого подтверждения в нерабочее время. Пусто → дефолт компании. */
  offHoursText?: string
  /** Текст письма авто-отказа по баллу резюме. Пусто → дефолт вакансии/платформы. */
  rejectLetter?: string
  /** Задержка авто-отказа, минуты. */
  rejectionDelayMinutes?: number
}

// ── Нативные поля Стадии 2 «Демо 1-я часть → переход на 2-ю часть» ──────────────
// Зеркало spec.anketaPassInvite (Портрет). Гейт срабатывает на сабмите анкеты
// демо; хранится на уровне конфига (не в конкретной стадии), т.к. триггер не
// привязан к id стадии. При включённом движке v2 рантайм читает эти поля вместо
// spec.anketaPassInvite (см. lib/funnel-v2/native-config.ts).
export interface FunnelV2Stage2 {
  /** Включён ли переход на 2-ю часть. */
  enabled?: boolean
  /** Порог объективного балла (вопросы-выбора), 0–100. */
  passThreshold?: number
  /** Порог AI-оценки ответов анкеты, 0–100 (ИЛИ-гейт с passThreshold). */
  aiEvalThreshold?: number
  /** Как переводить: seamless / message / both. */
  transferMode?: "seamless" | "message" | "both"
  /** id контент-блока «2-я часть» (demos.id). null = боевой блок. */
  contentBlockId?: string | null
  /** Плашка-поздравление сверху блока 2 (для прошедших). */
  passScreenTitle?: string
  passScreenText?: string
  /** Текст письма-приглашения на 2-ю часть + задержка перед отправкой, сек. */
  messageText?: string
  delaySeconds?: number
  /** Экран «Спасибо» для НЕ прошедших гейт. */
  failScreenTitle?: string
  failScreenText?: string
  /** Действие с не прошедшим гейт: none / pending_manual / pending_rejection. */
  failAction?: "none" | "pending_manual" | "pending_rejection"
  /** Задержка авто-отказа не прошедших, минуты. */
  failRejectDelayMinutes?: number
}

// ── Коммуникации воронки v2 (общий слой, не per-stage) ─────────────────────────
// ТОЛЬКО настройки, сегодня привязанные к Портрету: TG-уведомления о подходящих
// кандидатах и «горячий кандидат стынет». Стоп-слова и FAQ здесь НЕ хранятся —
// они уже режимо-независимы (AutoResponderSettings + vacancies.stop_words_json),
// секция коммуникаций переиспользует их существующий редактор.
export interface FunnelV2Communications {
  /** Telegram: подходящие кандидаты в канал компании. */
  tgAlerts?: {
    enabled: boolean
    minResumeScore: number | null
    minAnswersScore: number | null
    onGatePassed: boolean
  }
  /** «Горячий кандидат стынет»: высокий балл, открыл демо, 0 блоков. */
  hotCandidate?: {
    enabled: boolean
    threshold: number
    staleAfterHours: number
  }
}

export interface FunnelV2Config {
  enabled: boolean
  stages: FunnelV2Stage[]   // стадии 2…N (стадия 1 = Портрет, рендерится отдельно)
  /** Нативные поля Стадии 1 (перенос из Портрета). undefined = ещё не настроено. */
  stage1?: FunnelV2Stage1
  /** Нативные поля Стадии 2 (переход на 2-ю часть). undefined = ещё не настроено. */
  stage2?: FunnelV2Stage2
  /** Коммуникации (TG-уведомления, горячий кандидат). undefined = ещё не настроено. */
  communications?: FunnelV2Communications
}

export const DEFAULT_REJECT_DELAY_MIN = 60

export function emptyFunnelV2(): FunnelV2Config {
  return { enabled: false, stages: [] }
}

/** Стадия включена? Отсутствие поля = включена (обратная совместимость). */
export function isStageEnabled(stage: Pick<FunnelV2Stage, "enabled">): boolean {
  return stage.enabled !== false
}

/** Эффективный список сообщений стадии (обратная совместимость с messagePresetId).
 *  Правило чтения: `stage.messages ?? (stage.messagePresetId ? [stage.messagePresetId] : [])`. */
export function stageMessages(stage: Pick<FunnelV2Stage, "messages" | "messagePresetId">): string[] {
  return stage.messages ?? (stage.messagePresetId ? [stage.messagePresetId] : [])
}

/** Эффективный ТЕКСТ «приглашения» стадии для отправки кандидату (рантайм).
 *  Источник — stageMessages (messages из редактора, fallback на устаревший
 *  messagePresetId). Несколько сообщений склеиваются через пустую строку:
 *  механики досыла отдельными сообщениями в runtime-executor нет — одна
 *  отправка на вход в стадию. Пусто → "" (исполнитель берёт свой дефолт). */
export function effectiveStageMessageText(stage: Pick<FunnelV2Stage, "messages" | "messagePresetId">): string {
  return stageMessages(stage).map(m => (m ?? "").trim()).filter(Boolean).join("\n\n")
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
  const out: ScoreGate = { scoreType, threshold, failAction, autoEnabled: g.autoEnabled === true }
  // Три зоны (аддитивно): поля добавляем ТОЛЬКО когда заданы валидно — старые
  // конфиги нормализуются байт-в-байт как раньше (двухзонное поведение).
  if (typeof g.thresholdLower === "number" && Number.isFinite(g.thresholdLower)) {
    out.thresholdLower = Math.max(0, Math.min(threshold, g.thresholdLower))
  }
  if (g.middleAction === "manual_review" || g.middleAction === "prequalification") {
    out.middleAction = g.middleAction
  }
  if (g.autoRejectRed === true) out.autoRejectRed = true
  return out
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
        // Вкл/выкл стадии: только явный false выключает; иначе undefined (=вкл).
        enabled: st.enabled === false ? false : undefined,
        rejectText: typeof st.rejectText === "string" ? st.rejectText : undefined,
        farewellText: typeof st.farewellText === "string" ? st.farewellText : undefined,
        messages: Array.isArray(st.messages) ? st.messages.filter((m): m is string => typeof m === "string") : undefined,
        avitoStatus: typeof st.avitoStatus === "string" ? st.avitoStatus : undefined,
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
 *   Отклик → приглашение на демо [gate resume] · Демо (1-я часть) · Путь менеджера
 *   (2-я часть) [gate anketa] · Тест-задание [gate test] · Интервью · Оффер ·
 *   Нанят.
 * Стадия 1 «Портрет» (скан резюме) хранится не здесь — она рендерится из spec.
 * Все gate — autoEnabled=false (ничего не отсеивается без явного включения HR).
 *
 * @param seed префикс для генерации id стадий (по умолчанию 'default').
 */
export function defaultFunnelV2Stages(seed = "default"): FunnelV2Stage[] {
  const s = (suffix: string) => `${seed}-${suffix}`

  // 1) Отклик → приглашение на демо (первое касание — сообщение + ссылка на
  //    демо; условие прохода = gate по баллу AI-резюме). Входной скан резюме
  //    как таковой настраивается в Портрете (врезка над списком стадий).
  const respond = withScoreGate(makeStage("message", s("respond")), "resume")
  respond.title = "Отклик → приглашение на демо"
  respond.messages = [
    "{{name}}, здравствуйте! Спасибо за отклик на «{{vacancy}}». Подготовили короткий обзор должности — 15 минут, и вы узнаете о задачах, команде и условиях. Посмотрите:",
    "{{demo_link}}",
  ]

  // 2) Демо (1-я часть пути)
  const demo = makeStage("demo", s("demo"))
  demo.title = "Демо (1-я часть)"

  // 3) Путь менеджера (2-я часть) — анкета/предквалификация, gate по анкете
  const managerPath = withScoreGate(makeStage("prequalification", s("manager-path")), "anketa")
  managerPath.title = "Демо (2-я часть)"
  managerPath.messages = [
    "{{name}}, отлично — вы прошли первую часть! Предлагаем следующий шаг: {{demo_link}}",
  ]

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
