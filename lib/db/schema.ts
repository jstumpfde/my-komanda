import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  primaryKey,
  index,
  real,
  bigint,
  doublePrecision,
  uniqueIndex,
  numeric,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Modules ──────────────────────────────────────────────────────────────────

export const modules = pgTable("modules", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  icon:        text("icon"),
  isActive:    boolean("is_active").default(true),
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Plans ────────────────────────────────────────────────────────────────────

export const plans = pgTable("plans", {
  id:         uuid("id").primaryKey().defaultRandom(),
  slug:       text("slug").unique().notNull(),
  name:       text("name").notNull(),
  price:      integer("price").notNull(), // в копейках
  currency:   text("currency").default("RUB"),
  interval:   text("interval").default("month"), // 'month' | 'year'
  isPublic:   boolean("is_public").default(true),
  sortOrder:  integer("sort_order").default(0),
  trialDays:  integer("trial_days").default(14),
  isArchived: boolean("is_archived").default(false),
  allowCustomBranding: boolean("allow_custom_branding").default(true),
  archivedAt: timestamp("archived_at"),
  deletedAt:  timestamp("deleted_at"),
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Plan → Modules (лимиты по тарифу) ───────────────────────────────────────

export const planModules = pgTable("plan_modules", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  planId:              uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }).notNull(),
  moduleId:            uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  maxVacancies:        integer("max_vacancies"),   // null = безлимит
  maxCandidates:       integer("max_candidates"),
  maxEmployees:        integer("max_employees"),
  maxScenarios:        integer("max_scenarios"),
  maxUsers:            integer("max_users"),
  allowCustomBranding: boolean("allow_custom_branding").default(false),
  allowCustomColors:   boolean("allow_custom_colors").default(false),
  limits:              jsonb("limits"),
}, (t) => [unique().on(t.planId, t.moduleId)])

// ─── Tenant → Modules (активированные у клиента) ─────────────────────────────
// tenantId → companies.id  (companies выступают как tenant)

export const paymentRequisites = pgTable("payment_requisites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inn: text("inn").notNull(),
  bankAccount: text("bank_account").notNull(),
  bankName: text("bank_name").notNull(),
  bik: text("bik").notNull(),
  corrAccount: text("corr_account").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Группа 38: расширенный per-company брендинг. Базовые поля
// (logo/primary/bg/text) — отдельные колонки на companies; здесь дополнительные.
export interface CompanyBrandingExtra {
  accentColor?: string
  fontFamily?:  string  // "inter" | "manrope" | "ibm-plex" | "roboto"
}

import type { ProductProfile } from "@/lib/hiring/product-profile"
import type { CandidateSpec } from "@/lib/core/spec/types"
import type { AxisScoreResult } from "@/lib/core/spec/axis-scorer"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import type { RoleScoringFormula } from "@/lib/hiring/role-templates/types"
import type { InterviewScorecard } from "@/lib/candidates/interview-scorecard"
import type { TipFormula as TipCalcFormula } from "@/lib/tip/calculation"

// ── Рантайм воронки v2 — состояние кандидата (drizzle/0226) ─────────────────
// Хранится в candidates.funnel_v2_state_json (jsonb, nullable).
// NULL = кандидат ещё не вошёл в v2-воронку (едет по легаси-пути).
// Инвариант: stageId всегда ссылается на существующую стадию в vacancy.descriptionJson.funnelV2.stages.
export interface FunnelV2State {
  /** id текущей стадии (FunnelV2Stage.id) */
  stageId:                  string
  /** ISO-8601: когда кандидат вошёл в эту стадию */
  enteredAt:                string
  /** ISO-8601: когда стадия завершена (null = ещё в процессе) */
  completedAt:              string | null
  /** Балл за прохождение стадии (для test/prequalification/task) */
  scoreForStage:            number | null
  /** stageId отложенного отказа (если отказ запланирован, но ещё не исполнен) */
  pendingRejectionStageId:  string | null
  /** Уже отрендеренный текст отказа (с подставленными {{имя}} и пр.) — сохраняется при scheduleV2Rejection */
  pendingRejectionText?:    string | null
  /** Количество отправленных дожим-касаний на текущей стадии */
  touchesSent:              number
  /** ISO-8601: когда запустили цепочку дожима на текущей стадии */
  dozhimStartedAt:          string | null
  /** Пометка «застрял на ручном разборе»: стадия пройдена, но дальше в конфиге
   *  только ВЫКЛЮЧЕННЫЕ стадии (Воронка 3). null/отсутствует = обычный поток. */
  holdReason?:              string | null
  /** Анти-цикл жёлтой зоны: id стадии, с которой кандидата уже отправляли на
   *  предквалификацию (middleAction='prequalification'). Повторно с той же
   *  стадии не отправляем — ручной разбор. */
  middlePrequalFromStageId?: string | null
}

// ── MessageDefaults — редактируемые дефолтные тексты сообщений ──
// НЕ хардкод: наследование платформа → компания → вакансия. Платформенный
// эталон в platform_settings['message_defaults'] (правит админ в /admin),
// компания перебивает в hiring_defaults_json.messageDefaults (директор),
// вакансия — в своих полях (aiProcessSettings.inviteMessage / firstMessagesChain).
// Резолвинг — lib/messaging/effective-message-defaults.ts.
export interface MessageDefaults {
  inviteMessage:            string  // первичное сообщение, рабочее время ({{name}}/{{vacancy}}/{{demo_link}})
  offHoursMessage:          string  // первичное сообщение, нерабочее время (автоответ)
  firstMessageDelaySeconds: number  // «человеческая» пауза перед первым сообщением (сек)
  rejectMessage:            string  // текст отказа
}

// ── ChatbotDefaults — редактируемые дефолтные тексты AI чат-бота (НЕ хардкод) ──
// Платформенный эталон в platform_settings['chatbot_defaults']; компания
// перебивает в hiring_defaults_json.chatbotDefaults; вакансия — в своих настройках
// бота (aiChatbotSettings) и предквалификации. Резолвинг —
// lib/messaging/effective-chatbot-defaults.ts. SAFETY_RULES (security-гардрейлы)
// сюда НЕ входят — они намеренно неизменны в коде.
export interface ChatbotDefaults {
  rejectionInjection:     string  // попытка перепрограммировать AI
  rejectionSevereAbuse:   string  // мат / оскорбления / угрозы
  rejectionRepeatedAbuse: string  // повторная грубость
  rejectionUnstable:      string  // признаки нестабильности
  firstWarning:           string  // первое предупреждение за тон
  shortMessages:          string[] // «пишет…» имитация печати
  prequalReminderD1:      string  // напоминание предквала, день 1
  prequalReminderD3:      string  // напоминание предквала, день 3
  // Плейбук сценариев ответов бота (зарплата/локация/прокрастинация/возражения и т.д.)
  // Вставляется в системный промпт Executor'а после SAFETY_RULES. Редактируется в /admin.
  responsePlaybook:       string
}

// ── DripTemplates — редактируемые шаблоны дожима (НЕ хардкод) ──
// Платформенный эталон в platform_settings['drip_templates'] (правит админ).
// Конструктор воронки генерит цепочки касаний стадии из этих шаблонов; затем HR
// перебивает на стадии. Сид — lib/funnel-v2/dozhim-templates.ts (последний фолбэк).
export interface DripStepWords {
  noun:      string         // обзор/тест/задание/встречу/вопросы
  verb:      string | null  // ветка А: посмотрите/пройдите/… (null → особый блок, оффер)
  verb_done: string | null  // ветка Б: досмотрите/завершите (null → ветка Б не генерится)
  time:      string | null  // «5–7 минут» (null → строки со {{step_time}} пропускаются)
  link:      string         // demo_link / test_link / ""
}
export interface DripTemplates {
  stepWords: Record<string, DripStepWords>  // ключи: demo/test/task/prequalification/interview/offer
  branchA:   string[]  // «не открыл» (универсальные, со {{step_*}})
  branchB:   string[]  // «открыл, не завершил»
  live:      string[]  // живые этапы (интервью)
  offer:     string[]  // оффер
}

// Один диапазон времени доступности для записи (напр. { from:"10:00", to:"12:00" }).
export interface InterviewTimeRange {
  from: string  // "HH:MM"
  to:   string  // "HH:MM"
}

// ── CompanyHiringDefaults (drizzle/0156) ──
// Дефолты компании для всех вакансий (HR → Настройки найма).
// Хранится в companies.hiring_defaults_json. VacancyStopFactors определён ниже
// в этом же модуле (типы хойстятся, порядок объявления не важен).
export interface CompanyHiringDefaults {
  // Дефолтные тексты сообщений компании (перебивают платформенные; вакансия — эти).
  // Пустые/отсутствующие поля наследуются с уровня платформы.
  messageDefaults?: Partial<MessageDefaults>
  // Дефолтные тексты AI чат-бота компании (перебивают платформенные).
  chatbotDefaults?: Partial<ChatbotDefaults>
  // Drip-шаблоны дожима компании (перебивают платформенные; пустые поля наследуются).
  // Резолвер — lib/funnel-v2/effective-drip-templates.ts.
  dripTemplates?: Partial<DripTemplates>
  schedule?: {
    slotDuration?:     string
    bufferTime?:       string
    interviewFrom?:    string
    interviewTo?:      string
    interviewDays?:    string[]
    maxPerDay?:        string
    // Шаг сетки слотов записи (мин): 15/20/30/40/45/50/60. Дефолт 30.
    slotStep?:         number
    // Обеденный перерыв — в это окно слоты не предлагаются.
    // LEGACY: заменён на interviewDaySchedule (разрыв между двумя окнами дня).
    // Поля оставлены для backward-compat деривации, но новый источник правды —
    // interviewDaySchedule. Резолвер — lib/schedule/day-windows.ts.
    lunchEnabled?:     boolean
    lunchFrom?:        string  // "13:00"
    lunchTo?:          string  // "14:00"
    // Окна доступности для записи по каждому дню недели. У дня может быть
    // несколько диапазонов (напр. 10:00–12:00 и 14:00–17:00). Пустой массив
    // = день недоступен. НОВЫЙ источник правды для генерации слотов —
    // перекрывает interviewFrom/interviewTo/interviewDays/lunch*.
    // Если отсутствует — деривится из legacy-полей (lib/schedule/day-windows.ts).
    interviewDaySchedule?: {
      mon: InterviewTimeRange[]
      tue: InterviewTimeRange[]
      wed: InterviewTimeRange[]
      thu: InterviewTimeRange[]
      fri: InterviewTimeRange[]
      sat: InterviewTimeRange[]
      sun: InterviewTimeRange[]
    }
    remind24h?:        boolean
    remind2h?:         boolean
    // #27: доп. пороги напоминаний (по умолчанию ВКЛ, как остальные).
    remindMorning?:    boolean
    remind1h?:         boolean
    // Юрий 09.07: 4-й порог — «за 15 минут» (по умолчанию ВКЛ).
    remind15m?:        boolean
    timezone?:         string
    interviewMethods?: string[]
    officeAddress?:    string
    // Конфиг длительности и буфера на каждый способ интервью (additive, drizzle/0177+).
    // Если отсутствует — используются legacy-поля slotDuration/bufferTime/interviewMethods.
    interviewMethodConfigs?: Array<{
      method:  'phone' | 'zoom' | 'telemost' | 'meet' | 'office'
      enabled: boolean
      duration: number  // минуты
      buffer:   number  // минуты между встречами
    }>
    // Slug способа интервью, выбранного по умолчанию (additive).
    defaultInterviewMethod?: string
  }
  stopFactorsDefaults?:      VacancyStopFactors
  // Мастер-тумблер: применять stopFactorsDefaults живьём ко ВСЕМ вакансиям
  // компании во время обработки hh-очереди (company-level стоп-факторы).
  // Дефолт: false — предохранитель от массовых неожиданных отказов.
  stopFactorsApplyToAll?:    boolean
  automation?: {
    autoDemo?:   boolean
    autoInvite?: boolean
    minScore?:   number
    autoReject?: boolean
  }
  funnelScenario?: string
  dataRetention?:  string
  webhooks?: { url?: string; events?: Record<string, boolean> }
  bitrix?:   { url?: string; trigger?: string }
  // Резерв → Рефералы: правила реферальной программы (drizzle/0167).
  referralRules?: {
    bonusPerHire?:       number
    trialMonths?:        number
    maxActiveReferrals?: number
    standardScreening?:  boolean
  }
  // O2: авто-сбор обратной связи (опросы адаптации 30/60/90). Дефолт компании;
  // отправка — модулем «Адаптация» после найма.
  feedbackSurveys?: {
    enabled?: boolean
    d30?: boolean; d60?: boolean; d90?: boolean
    q30?: string;  q60?: string;  q90?: string
  }
  // O1: мультикомпанийность — список компаний-брендов, под которые ведётся найм
  // (аутсорсинг/рекрутинг). Основная компания берётся из профиля; здесь —
  // дополнительные. При создании вакансии HR выбирает компанию (vacancy-side — отдельно).
  showCompanySelector?: boolean
  brandCompanies?: Array<{ id: string; name: string; slogan?: string; description?: string; logo?: string; website?: string }>
  // O1: какая компания выбрана по умолчанию при создании вакансии.
  // "" = основная (№1, из профиля), иначе id из brandCompanies.
  defaultBrandCompanyId?: string
  // Маппинг воронки → hh.ru на уровне компании: какое действие hh.ru шлётся
  // при входе кандидата в стадию. Ключ — slug стадии, значение —
  // "invitation"|"discard"|"assessment"|"hired"|null. Дефолт для вакансий, где
  // воронка не кастомизирована.
  stageHhActions?: Record<string, "invitation" | "discard" | "assessment" | "hired" | null>
  // Палитра стадий на уровне компании: переименование и перекраска.
  // Применяется как soft-дефолт — per-vacancy customLabel/customColor перекрывает.
  stageLabels?: Record<string, string>
  stageColors?: Record<string, string>
  // Маппинг воронки → Авито: действие при входе кандидата в стадию.
  // Интеграция в разработке — конфиг сохраняется сейчас, применится после подключения.
  stageAvitoActions?: Record<string, string>
  // Маппинг воронки → SuperJob: действие при входе кандидата в стадию.
  // Интеграция в разработке — конфиг сохраняется сейчас, применится после подключения.
  stageSjActions?: Record<string, string>
  // Включённые стадии воронки компании (редактор стадий).
  // Ключ — slug стадии, значение — true/false. Системные (isSystem=true) всегда true.
  enabledStages?: Record<string, boolean>
  // Порядок стадий в воронке (slug[]).
  // Если не задан — используется платформенный sortOrder.
  stageOrder?: string[]
  // Пресеты воронки компании (сохранённые конфигурации).
  // Хранятся здесь же, в hiring_defaults_json — нет смысла в отдельной таблице.
  companyFunnelPresets?: Array<{
    id:            string    // uuid
    name:          string
    createdAt:     string    // ISO date
    enabledStages: Record<string, boolean>
    stageOrder:    string[]
    stageLabels:   Record<string, string>
    stageColors:   Record<string, string>
    stageHhActions:    Record<string, string | null>
    stageAvitoActions: Record<string, string>
    stageSjActions:    Record<string, string>
  }>
  // Настройки доступа ролей (HR → Настройки → Роли и доступ). Хранятся
  // на уровне компании (общие, не per-user), чтобы шарились между всеми.
  rolePermissions?: {
    // По умолчанию корзина вакансий видна только директору/главному HR.
    // true → HR-менеджеры тоже видят таб «Корзина» и могут восстанавливать/удалять.
    hrManagerTrashAccess?: boolean
  }
  // B5: единые колонки списка кандидатов для всей компании.
  // Настраивает только директор; остальные HR видят read-only.
  // Ключи соответствуют CardDisplaySettings из components/dashboard/card-settings.tsx.
  candidateColumns?: Record<string, boolean>
  // F2: список Telegram-каналов/чатов компании для постинга вакансий.
  // Хранится в hiring_defaults_json — не требует отдельной таблицы.
  telegramChannels?: Array<{
    id: string        // uuid v4 на клиенте
    name: string      // «Наш канал разработчиков»
    username: string  // @devjobs или https://t.me/devjobs
  }>
  // Настройки цветов KPI-карточек дашборда HR (без миграции, jsonb).
  // intensity: "vivid" — сплошной фон + белый текст; "pale" — светлый тинт.
  // colors: hex по ключам карточек (без # не храним — храним полный hex "#rrggbb").
  dashboardCards?: {
    intensity: "vivid" | "pale"
    colors: Record<string, string>
  }
  // ТЗ №1: профиль продукта/продаж для найма (ручное заполнение). Без миграции —
  // живёт внутри hiring_defaults_json. Seed для генерации анкет/Портрета — отд. ТЗ.
  // productProfiles — продукты ОСНОВНОЙ компании (№1). Продукты доп.брендов
  // (мультикомпания) — в brandProductProfiles по id бренда из brandCompanies.
  productProfiles?: ProductProfile[]
  defaultProductProfileId?: string
  brandProductProfiles?: Record<string, ProductProfile[]>
  brandDefaultProductProfileIds?: Record<string, string>
  // Резерв: срок хранения архивных записей до авто-перемещения в Корзину.
  // Дефолт 5 месяцев. 0 = «никогда не удалять» (показываем предупреждение 152-ФЗ).
  // После Корзины ещё ~1 месяц до авто-удаления (фикс). Cron talent-pool-cleanup.
  reserveRetentionMonths?: number
  // Страж исходящих: алерт в Telegram компании при проблемном сообщении (сырые
  // переменные/пустое). Дефолт OFF — владелец компании включает сам; летит в её
  // собственный бот (telegramBotToken/telegramChatId). Option 1, Юрий 27.06.
  messageGuardAlert?: { enabled?: boolean }
  // Страж исходящих: придержать подозрительное сообщение на проверку HR (вместо
  // отправки). Дефолт OFF. При срабатывании — запись в held_messages + уведомление
  // HR. Option 2, Юрий 27.06.
  messageGuardHold?: { enabled?: boolean }
  // #36 Окно отправки по типу касания: для каждой категории — "always"
  // (круглосуточно) или "window" (по расписанию вакансии). Отсутствующие
  // ключи наследуют DEFAULT_TOUCH_WINDOWS (транзакционные — always, дожим —
  // window). Резолвер — lib/messaging/touch-window.ts. Читает cron follow-up.
  messageWindows?: Record<string, "always" | "window">
  // #37а Очерёдность исходящих: порядок групп приоритета (сверху = уходит
  // первым). Отсутствие/пустой массив → DEFAULT_SEND_PRIORITY_ORDER.
  // Значения — SendPriorityGroup из lib/messaging/send-priority.ts.
  sendPriorityOrder?: string[]
  // Очерёдность ПО ТИПУ СООБЩЕНИЯ (07.07): порядок категорий касания внутри
  // группы приоритета кандидата (сверху = уходит первым). Отсутствие/пустой
  // массив → DEFAULT_MESSAGE_CATEGORY_ORDER. Значения — TouchCategory из
  // lib/messaging/touch-window.ts. Резолвер там же (normalizeMessageCategoryOrder).
  messageCategoryOrder?: string[]
  // База знаний: лимит AI-токенов/мес, переопределяющий платформенный дефолт
  // (platform_settings.ai_monthly_token_limit, см. lib/knowledge/token-limits.ts).
  // undefined/null → используется платформенный дефолт. 0 — зарезервировано
  // под «безлимит» на будущее, сейчас UI такого не предлагает.
  aiMonthlyTokenLimit?: number | null
}

// ── CompanyLegalContact (drizzle/0177) ──
// Контактные данные для юр.документов (/settings/legal). Независимы от
// основных реквизитов — телефон/email могут отличаться от companies.*.
// При отсутствии поля используется fallback на companies.* в генераторе.
export interface CompanyLegalContact {
  companyName?:  string
  inn?:          string  // ИНН — нужен для генерации политики конфиденциальности
  email?:        string
  phone?:        string
  legalAddress?: string
  responsible?:  string  // Ответственный за обработку персональных данных
}

// ── CompanyWorkSchedule (drizzle/0176) ──
// Standalone-расписание компании (/settings/schedule). Отдельное от can-send-now
// (vacancies.schedule_*), календаря и hiring-settings — см. memory
// schedule-three-systems-keep-separate. Просто хранит своё значение.
// Расписание одного дня для календаря HR.
export interface CalendarDaySchedule {
  enabled: boolean
  start: string   // "09:00"
  end:   string   // "18:00"
  slot:  string   // слот в минутах: "15"|"30"|"60"|...
}

export interface CompanyWorkSchedule {
  schedule?: { enabled: boolean; from: string; to: string }[] // 7 строк, Пн..Вс
  timezone?: string
  country?:  string
  lunch?:    { enabled: boolean; from: string; to: string }
  customHolidays?: { id: string; date: string; name: string }[]
  absences?: {
    id: string; employee: string; type: string
    dateFrom: string; dateTo: string; status: string; comment: string
  }[]
  // Настройки рабочего расписания календаря HR (/hr/calendar → шестерёнка).
  // БЕЗ миграции — jsonb принимает любые поля.
  calendarWeekSchedule?: Record<string, CalendarDaySchedule> // ключ = день недели (0–6)
  // Единый company-level источник праздников (#14).
  // Читается и CalendarView (шестерёнка → Праздничные дни), и VacancyScheduleSettings
  // (Нерабочие дни). БЕЗ миграции — jsonb принимает любые поля.
  calendarExcludedHolidayIds?: string[]  // id из RU_HOLIDAYS
  calendarCustomHolidays?: { from: string; to: string; label: string }[] // произвольные даты
}

// ── NancyVoiceSettings (drizzle/0182) ──
// Хранится в companies.nancy_voice_json (jsonb). БЕЗ миграции — jsonb принимает любые поля.
export interface NancyVoiceSettings {
  // ── Голос (TTS) ──
  voice?:      string  // alena | filipp | oksana | jane | zahar | ermil
  emotion?:    string  // good | neutral | evil
  speed?:      number  // 0.8 .. 1.5
  ttsEnabled?: boolean // false = только браузерный fallback

  // ── Ассистент ──
  enabled?:            boolean   // глобальный вкл/выкл (по умолчанию true)
  name?:               string    // кастомное имя (по умолчанию «Нэнси»)
  greeting?:           string    // кастомное приветствие (если пусто — дефолтные под модуль)
  visibleToRoles?:     string[]  // какие роли видят ассистента (пусто/undefined = все)
  modules?:            string[]  // в каких модулях показывать (пусто/undefined = все)
  customInstructions?: string    // доп. инструкции к системному промпту
}

/** Алиас для удобного именования — тот же тип */
export type NancyAssistantSettings = NancyVoiceSettings

// Индивидуальный рабочий график сотрудника (users.custom_schedule).
// Настраивается самим сотрудником в Профиле.
export interface UserCustomSchedule {
  enabled: boolean
  days: Record<string, { active: boolean; start: string; end: string }>
  // Обеденный перерыв (один на все рабочие дни)
  lunch?: { enabled: boolean; start: string; end: string }
}

export const companies = pgTable("companies", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  name:               text("name").notNull(),
  inn:                text("inn").unique(),
  kpp:                text("kpp"),
  legalAddress:       text("legal_address"),
  city:               text("city"),
  industry:           text("industry"),
  postalCode:         text("postal_code"),
  foundedYear:        integer("founded_year"),
  revenueRange:       text("revenue_range"),           // Solo wizard step-1
  ogrn:               text("ogrn"),
  fullName:           text("full_name"),
  director:           text("director"),
  description:        text("description"),
  companyDescription: text("company_description"),    // Описание для вакансий
  email:              text("email"),
  phone:              text("phone"),
  employeeCount:      integer("employee_count"),
  registrationDate:   text("registration_date"),     // ISO date string
  officeAddress:      text("office_address"),
  postalAddress:      text("postal_address"),
  website:            text("website"),
  crmStatus:          text("crm_status"),              // 'active'|'exists_unused'|'none'
  crmName:            text("crm_name"),
  salesScripts:       text("sales_scripts"),           // 'yes'|'partial'|'no'
  trainingSystem:     text("training_system"),         // 'yes'|'partial'|'no'
  trainer:            text("trainer"),
  salesManagerType:   text("sales_manager_type"),      // 'none'|'hunter'|...
  isMultiProduct:     boolean("is_multi_product").default(false),
  logoUrl:            text("logo_url"),
  logoDarkUrl:        text("logo_dark_url"),
  brandPrimaryColor:  text("brand_primary_color").default("#3b82f6"),
  brandBgColor:       text("brand_bg_color").default("#f0f4ff"),
  brandTextColor:     text("brand_text_color").default("#1e293b"),
  // Группа 38: расширенные поля брендинга поверх базовых колонок.
  brandingJson:       jsonb("branding_json").$type<CompanyBrandingExtra>().notNull().default({}),
  customTheme:        jsonb("custom_theme"),       // { primary, background, foreground, sidebar, accent }
  demoProfile:        jsonb("demo_profile").default({}),  // Профиль для демонстраций должности
  brandName:          text("brand_name"),
  brandSlogan:        text("brand_slogan"),
  subdomain:          text("subdomain").unique(),
  // join link
  joinCode:           text("join_code").unique(),
  joinEnabled:        boolean("join_enabled").default(true),
  // billing / subscription
  planId:             uuid("plan_id").references(() => plans.id),
  billingEmail:       text("billing_email"),
  // Документооборот (миграция 0149): счета/акты шлются на billingEmail.
  // paperInvoicesRequired — клиенту нужны бумажные оригиналы; адрес — куда слать.
  // autoInvoiceEnabled — авто-создание счёта за 7 дней (по умолчанию выкл).
  // edo* — задел под подключение ЭДО (Диадок/СБИС/…) в будущем.
  paperInvoicesRequired: boolean("paper_invoices_required").default(false),
  // Адрес для оригиналов — отдельные ячейки (миграция 0153). paperInvoiceAddress
  // = улица/дом/офис; индекс/город/получатель — отдельно.
  paperInvoiceAddress:   text("paper_invoice_address"),
  paperInvoiceIndex:     text("paper_invoice_index"),
  paperInvoiceCity:      text("paper_invoice_city"),
  paperInvoiceRecipient: text("paper_invoice_recipient"),
  autoInvoiceEnabled:    boolean("auto_invoice_enabled").default(false),
  edoEnabled:            boolean("edo_enabled").default(false),
  edoProvider:           text("edo_provider"),
  edoOperatorId:         text("edo_operator_id"),
  trialEndsAt:        timestamp("trial_ends_at"),
  subscriptionStatus: text("subscription_status").default("trial"), // 'trial'|'active'|'paused'|'cancelled'|'expired'
  currentPlanId:      uuid("current_plan_id").references(() => plans.id),
  // Дата конца оплаченного периода (миграция 0150). Выставляется при оплате
  // счёта (= invoice.periodEnd). По ней считается отсчёт для платных тарифов и
  // авто-счёт на продление за 7 дней (cron /api/cron/auto-invoices).
  currentPeriodEnd:   timestamp("current_period_end"),
  // Telegram bot (multitenant knowledge base assistant) +
  // Группа 34: тот же токен переиспользуется как HR-уведомления, если
  // указан telegramChatId компании. См. lib/telegram/send-to-company.ts.
  telegramBotToken:    text("telegram_bot_token"),
  telegramBotUsername: text("telegram_bot_username"),
  telegramWebhookSet:  boolean("telegram_webhook_set").default(false),
  // Группа 34: per-company чат для HR-уведомлений (новые отклики,
  // AI-эскалации). Главный канал Юрия — отдельный, не здесь.
  telegramChatId:      text("telegram_chat_id"),
  // drizzle/0158 — для будущего Telegram-канала чат-бота (токен бота-кандидата)
  candidateBotToken:   text("candidate_bot_token"),
  // drizzle/0198 — F7: Telegram-бот для переписки с кандидатами
  // username без @, напр. "MyCompanyJobsBot"; заполняется автоматически из getMe
  candidateBotUsername:       text("candidate_bot_username"),
  // secret_token для защиты webhook (Telegram передаёт в X-Telegram-Bot-Api-Secret-Token)
  candidateBotWebhookSecret:  text("candidate_bot_webhook_secret"),
  // Privacy policy (per-company, ФЗ-152) — null = используется дефолтный шаблон
  privacyPolicyHtml:        text("privacy_policy_html"),
  privacyPolicyUpdatedAt:   timestamp("privacy_policy_updated_at"),
  // Безопасность AI-чат-бота: глобальный kill switch на всю компанию.
  aiChatbotKilled:          boolean("ai_chatbot_killed").notNull().default(false),
  // Группа 36: режим строгости pre-filter к severe_abuse.
  //   'strict'  — автоотказ + сообщение (текущее поведение)
  //   'lenient' — предупреждение, диалог продолжается
  aiAbuseMode:              text("ai_abuse_mode").notNull().default("strict"),
  // Безопасность отправки: минимальная задержка между отправками follow-up
  // сообщений в hh-чат (в секундах, per-company). Меньшие значения повышают
  // риск бана аккаунта hh.ru за подозрительную активность. Дефолт 31 сек,
  // допустимый диапазон в UI/API 21..600. Cron умножает на 1000 → ms.
  followUpSendDelaySeconds: integer("follow_up_send_delay_seconds").notNull().default(31),
  // Корзина вакансий: срок хранения в днях до авто-удаления (drizzle/0141).
  // «В корзине» = vacancies.deleted_at IS NOT NULL. Cron /api/cron/trash-cleanup
  // удаляет вакансии навсегда, когда deleted_at старше trash_retention_days.
  // Допустимые значения 1/3/7/14/30/60/90, дефолт 30.
  trashRetentionDays:       integer("trash_retention_days").notNull().default(30),
  // Дефолты найма (расписание/webhooks/битрикс/хранение/стоп-факторы/автоматизация) (drizzle/0156)
  hiringDefaultsJson:       jsonb("hiring_defaults_json").$type<CompanyHiringDefaults>().notNull().default({}),
  // Standalone-расписание компании (/settings/schedule) — отдельное хранилище
  // общего рабочего времени. НЕ связано с can-send-now (vacancies.schedule_*),
  // календарём, hiring-settings. Миграция 0176. См. schedule-three-systems-keep-separate.
  workScheduleJson:         jsonb("work_schedule_json").$type<CompanyWorkSchedule>().notNull().default({}),
  // Контактные данные для юр.документов (/settings/legal). Отдельны от
  // companies.* — телефон/email могут отличаться от основных реквизитов.
  // Подставляются в генератор политики (раздел «куда обращаться»). Миграция 0177.
  legalContactJson:         jsonb("legal_contact_json").$type<CompanyLegalContact>().notNull().default({}),
  // Настройки голоса ассистента Нэнси (TTS Yandex SpeechKit). Миграция 0182.
  nancyVoiceJson:           jsonb("nancy_voice_json").$type<NancyVoiceSettings>().notNull().default({}),
  // Корзина компаний (миграция 0148): NULL — активна; не-NULL — в корзине,
  // cron trash-cleanup удалит навсегда через trash_retention_days. Признак
  // корзины — deleted_at (как у вакансий), отдельного статуса не вводим.
  // Per-company оверрайд видимых модулей сайдбара (миграция 0215).
  //   null            — grandfather: модули по роли + существующим оверрайдам
  //                     (текущее поведение клиентов НЕ меняется).
  //   непустой массив — компания видит ИМЕННО эти ключи модулей (оверрайд роли),
  //                     hr всегда доступен как минимум (гарантируется в сайдбаре).
  //   пустой массив   — трактуется как сброс (grandfather), нормализуется в null
  //                     в API /admin/clients/[id].
  // Управляется из админки /admin/clients/[id] → «Модули клиента».
  // НЕ лицензионный гейтинг (tenant_modules) — отдельный безопасный переключатель.
  enabledModules:     jsonb("enabled_modules").$type<string[] | null>(),
  // Ответственные менеджеры платформы (drizzle/0218). У КАЖДОГО клиента и
  // партнёра (партнёр = компания + integrator) может быть назначен менеджер
  // продаж и клиентский менеджер — они получают % с оплат (ставки настраиваются
  // в manager_commission_rates). Авто-назначение: «кто завёл» → менеджер продаж.
  salesManagerId:     uuid("sales_manager_id").references((): any => users.id, { onDelete: "set null" }),
  accountManagerId:   uuid("account_manager_id").references((): any => users.id, { onDelete: "set null" }),
  // Явный ответственный за создание событий календаря (интервью-запись),
  // когда у компании нет собственных users (партнёрские клиенты, ведутся
  // только имперсонацией — Юрий 09.07, Revoluterra). Может указывать на
  // пользователя партнёра. NULL → автофолбэк (первый user компании, затем
  // первый user управляющего партнёра, см. /api/public/schedule/[token]).
  calendarDefaultUserId: uuid("calendar_default_user_id").references((): any => users.id, { onDelete: "set null" }),
  // Архив компаний (drizzle/0220): NULL — активна; не-NULL — в архиве (скрыта из
  // активного списка, но НЕ в корзине). Из архива можно восстановить или отправить
  // в корзину (deleted_at). Таб «Архив» в /admin/clients.
  archivedAt:         timestamp("archived_at"),
  deletedAt:          timestamp("deleted_at"),
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
})

// Ставки комиссий менеджеров платформы (drizzle/0218). Одна строка на роль:
//   sales_manager   — salePercent (% при продаже) + accompanimentPercent (% сопровождение)
//   account_manager — accompanimentPercent (% сопровождение); salePercent обычно 0
// «Всё настраивается» — значения правит платформенный админ в /admin/roles
// (раздел «Менеджеры и комиссии»). Дефолты сидятся миграцией.
export const managerCommissionRates = pgTable("manager_commission_rates", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  role:                 text("role").notNull().unique(), // 'sales_manager' | 'account_manager'
  salePercent:          text("sale_percent").notNull().default("0"),          // numeric as text
  accompanimentPercent: text("accompaniment_percent").notNull().default("0"), // numeric as text
  updatedAt:            timestamp("updated_at").defaultNow(),
})

export const companyBankAccounts = pgTable("company_bank_accounts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  companyId:  uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  bankName:   text("bank_name"),
  bik:        text("bik"),
  rs:         text("rs"),
  ks:         text("ks"),
  isDefault:  boolean("is_default").default(false),
  sortOrder:  integer("sort_order").default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Раздельные Имя/Фамилия (миграция 0209). NULLABLE — legacy-юзеры без разбивки.
  // При заполнении обоих полей name обновляется как `${firstName} ${lastName}`.
  firstName: text("first_name"),
  lastName: text("last_name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // 'admin' | 'manager' | 'client' | 'client_hr'
  companyId: uuid("company_id").references(() => companies.id),
  avatarUrl: text("avatar_url"),
  position: text("position"),                  // реальная должность (не роль в системе)
  permissions: jsonb("permissions").default("{}"), // { manage_company, manage_team, manage_billing, ... }
  customSchedule: jsonb("custom_schedule").$type<UserCustomSchedule>(),  // график сотрудника (Профиль)
  telegramChatId: text("telegram_chat_id"),
  // Личный chat_id в ПЛАТФОРМЕННОМ боте напоминаний об интервью (@Ren_HR_bot,
  // миграция 0270) — отдельный от telegramChatId (тот привязан к КОМПАНЕЙСКОМУ
  // боту базы знаний, другой bot token). Привязка — /start <код> через
  // app/api/telegram/manager-bot/webhook, код выдаёт /api/telegram/manager-bot/link-code.
  managerReminderChatId: text("manager_reminder_chat_id"),
  // Юрий 10.07: личные контакты для оперативной связи с кандидатом — видимо
  // редактируемые поля (не вшитый текст), подставляются в сообщение со
  // ссылкой на встречу ("подтвердите получение" + контакты HR).
  contactTelegram: text("contact_telegram"),
  contactMax:      text("contact_max"),
  contactPhone:    text("contact_phone"),
  isActive: boolean("is_active").default(true),
  // Корзина пользователей (миграция 0152): soft-delete для очистки списка
  // (демо-наблюдатели, осиротевшие). NULL = активный.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Пер-юзерные настройки UI ──────────────────────────────────────────────────

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  candidatesViewMode: text("candidates_view_mode").default("list"), // 'funnel' | 'list' | 'kanban' | 'tiles'
  candidatesColumnsJson: jsonb("candidates_columns_json").default("{}"),
  // { key: ListSortKey, dir: "asc"|"desc" } — последний выбор сортировки списка
  // кандидатов. NULL → дефолт createdAt desc, инжектится и persist'ится при
  // первом визите (см. app/(modules)/hr/vacancies/[id]/page.tsx).
  candidatesListSortJson: jsonb("candidates_list_sort_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// P0-9: пер-юзерный last_seen на вакансию для расчёта дельты «свежих»
// кандидатов (бейдж «+N новых» в шапке + список на дашборде).
export const userVacancyViews = pgTable("user_vacancy_views", {
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vacancyId:  uuid("vacancy_id").notNull().references(() => vacancies.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk:           primaryKey({ columns: [t.userId, t.vacancyId] }),
  byVacancyIdx: index("idx_user_vacancy_views_vacancy").on(t.vacancyId),
}))

// ─── Sales: CRM Компании ─────────────────────────────────────────────────────

export const salesCompanies = pgTable("sales_companies", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:           text("name").notNull(),
  inn:            text("inn"),
  kpp:            text("kpp"),
  ogrn:           text("ogrn"),
  industry:       text("industry"),
  city:           text("city"),
  address:        text("address"),
  website:        text("website"),
  phone:          text("phone"),
  email:          text("email"),
  revenue:        text("revenue"),
  employeesCount: integer("employees_count"),
  description:    text("description"),
  logoUrl:        text("logo_url"),
  type:           text("type").default("client"),    // 'own'|'client'|'partner'
  status:         text("status").default("active"),  // 'active'|'archive'
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Sales: CRM Контакты ─────────────────────────────────────────────────────

export const salesContacts = pgTable("sales_contacts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  companyId:  uuid("company_id").references(() => salesCompanies.id, { onDelete: "set null" }),
  firstName:  text("first_name").notNull(),
  lastName:   text("last_name").notNull(),
  middleName: text("middle_name"),
  position:   text("position"),
  department: text("department"),
  phone:      text("phone"),
  mobile:     text("mobile"),
  email:      text("email"),
  telegram:   text("telegram"),
  whatsapp:   text("whatsapp"),
  comment:    text("comment"),
  isPrimary:  boolean("is_primary").default(false),
  status:     text("status").default("active"),  // 'active'|'archive'
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
})

// ─── Sales: CRM Сделки ──────────────────────────────────────────────────────

export const salesDeals = pgTable("sales_deals", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenantId:          uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:             text("title").notNull(),
  amount:            integer("amount"),                        // сумма в копейках (для точности)
  currency:          text("currency").default("RUB"),          // RUB/USD/EUR
  stage:             text("stage").default("new").notNull(),   // этап воронки
  priority:          text("priority").default("medium"),       // low/medium/high
  probability:       integer("probability").default(0),        // вероятность закрытия %
  companyId:         uuid("company_id").references(() => salesCompanies.id, { onDelete: "set null" }),
  contactId:         uuid("contact_id").references(() => salesContacts.id, { onDelete: "set null" }),
  assignedToId:      uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  description:       text("description"),
  source:            text("source"),                           // сайт, звонок, реферал, hh.ru
  expectedCloseDate: timestamp("expected_close_date"),
  closedAt:          timestamp("closed_at"),
  createdAt:         timestamp("created_at").defaultNow(),
  updatedAt:         timestamp("updated_at").defaultNow(),
})

// ─── Sales: Каналы коммуникации (мультиканальный слой) ──────────────────────────
// Решение 07.06.2026: каналы = ВСЕ через адаптеры (lib/channels/*), первый — Telegram.
// Транспорт-абстракция (адаптеры) живёт в коде; здесь — per-tenant реквизиты,
// диалоги с лидами и история сообщений.

// Реквизиты доступа к каналу для конкретного тенанта (свой Telegram-бот салона,
// email-аккаунт и т.п.). Один тенант может иметь несколько аккаунтов разных каналов.
export const salesChannelAccounts = pgTable("sales_channel_accounts", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenantId:          uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  channel:           text("channel").notNull(),       // telegram|email|widget|whatsapp|max|messenger
  title:             text("title"),                   // отображаемое имя аккаунта для салона
  isActive:          boolean("is_active").default(true),
  botToken:          text("bot_token"),               // telegram: токен бота (секрет)
  fromAddress:       text("from_address"),            // email: адрес отправителя
  externalAccountId: text("external_account_id"),     // username бота / номер / страница
  webhookSecret:     text("webhook_secret"),          // секрет для верификации входящих
  config:            jsonb("config"),                 // произвольная конфигурация провайдера
  createdAt:         timestamp("created_at").defaultNow(),
  updatedAt:         timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sales_channel_accounts_tenant_idx").on(t.tenantId, t.channel),
])

// Диалог (тред) с лидом в конкретном канале. Один тред на (аккаунт канала + клиент).
export const salesConversations = pgTable("sales_conversations", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenantId:         uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  channel:          text("channel").notNull(),
  channelAccountId: uuid("channel_account_id").references(() => salesChannelAccounts.id, { onDelete: "cascade" }).notNull(),
  externalUserId:   text("external_user_id").notNull(),   // chat_id / email клиента в канале
  externalUserName: text("external_user_name"),           // имя/username из канала
  contactId:        uuid("contact_id").references(() => salesContacts.id, { onDelete: "set null" }),
  dealId:           uuid("deal_id").references(() => salesDeals.id, { onDelete: "set null" }),
  status:           text("status").default("active").notNull(), // active|paused_for_human|closed
  lastMessageAt:    timestamp("last_message_at"),
  bookedAt:         timestamp("booked_at"),            // когда создана бронь — исключает из дожима
  followupCount:    integer("followup_count").default(0),  // сколько раз дожали
  lastFollowupAt:   timestamp("last_followup_at"),     // когда дожимали последний раз
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
}, (t) => [
  unique("sales_conversations_uniq_user").on(t.channelAccountId, t.externalUserId),
  index("sales_conversations_tenant_idx").on(t.tenantId),
])

// Отдельное сообщение в диалоге (вход/исход, кто автор, текст/нажатие кнопки).
export const salesMessages = pgTable("sales_messages", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenantId:          uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  conversationId:    uuid("conversation_id").references(() => salesConversations.id, { onDelete: "cascade" }).notNull(),
  direction:         text("direction").notNull(),        // inbound|outbound
  role:              text("role").notNull(),             // client|bot|manager
  text:              text("text").notNull().default(""),
  callbackData:      text("callback_data"),              // value нажатой кнопки
  externalMessageId: text("external_message_id"),
  raw:               jsonb("raw"),                       // сырой апдейт провайдера (аудит/отладка)
  createdAt:         timestamp("created_at").defaultNow(),
}, (t) => [
  index("sales_messages_conversation_idx").on(t.conversationId, t.createdAt),
])

// Конфигурация sales-чатбота на уровне салона (тенанта). Аналог полей
// vacancy.aiChatbot* в HR. settings(jsonb) хранит SalesChatbotSettings:
// подбор времени (3.2) / дожим (5.1) / эскалация (6.1) / тайминги — с дефолтами.
export const salesBotConfigs = pgTable("sales_bot_configs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  isEnabled:    boolean("is_enabled").default(true),
  botName:      text("bot_name"),        // имя ассистента (вопрос 1.2)
  greeting:     text("greeting"),        // приветствие (вопрос 1.1)
  systemPrompt: text("system_prompt"),   // доп. инструкции к промпту (как vacancy.aiChatbotPrompt)
  settings:     jsonb("settings"),       // SalesChatbotSettings (lib/ai/sales-chatbot-settings.ts)
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
}, (t) => [
  unique("sales_bot_configs_tenant_uniq").on(t.tenantId),
])

// Именованные пресеты настроек sales-чатбота (HR сохраняет/применяет наборы).
// settings(jsonb) — тот же формат SalesChatbotSettings, что и в sales_bot_configs.
export const salesBotPresets = pgTable("sales_bot_presets", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:      text("name").notNull(),
  settings:  jsonb("settings").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sales_bot_presets_tenant_idx").on(t.tenantId),
])

// Per-tenant настройки CRM/продаж. Заменяет хардкод стадий из
// lib/crm/deal-stages.ts: тип воронки + редактируемые стадии. funnelType:
// 'booking' (продажи времени) | 'b2b' (классическая сделка). stages — массив
// CrmStage {id,label,color,probability,order}; null = дефолт по funnelType.
// leadSources/automations — задел под фазу 2 (источники лидов, автоправила).
export const salesSettings = pgTable("sales_settings", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  funnelType:  text("funnel_type").default("booking").notNull(), // 'booking' | 'b2b'
  stages:      jsonb("stages"),        // CrmStage[] — null = дефолт по funnelType
  leadSources: jsonb("lead_sources"),  // string[] (фаза 2)
  automations: jsonb("automations"),   // правила по стадиям (фаза 2)
  slotStepMinutes: integer("slot_step_minutes").default(30),  // шаг сетки слотов записи
  bookAheadDays:   integer("book_ahead_days").default(14),    // на сколько дней вперёд запись
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
}, (t) => [
  unique("sales_settings_tenant_uniq").on(t.tenantId),
])

// Задачи отдела продаж (per-tenant). Привязка к сделке опциональна.
export const salesTasks = pgTable("sales_tasks", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  description:  text("description"),
  priority:     text("priority").default("medium"),  // high / medium / low
  dueDate:      date("due_date"),
  done:         boolean("done").default(false),
  dealId:       uuid("deal_id").references(() => salesDeals.id, { onDelete: "set null" }),
  assigneeName: text("assignee_name"),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sales_tasks_tenant_idx").on(t.tenantId),
])

// Каталог товаров/услуг отдела продаж (per-tenant). Отдельно от booking_services
// (записываемые услуги салона) — это коммерческий прайс-лист для сделок.
export const salesProducts = pgTable("sales_products", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  category:    text("category"),
  description: text("description"),
  price:       integer("price").default(0),   // копейки
  unit:        text("unit").default("шт"),
  vat:         integer("vat").default(20),     // процент
  status:      text("status").default("active"), // active / archived
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sales_products_tenant_idx").on(t.tenantId),
])

// ─── Vacancies ────────────────────────────────────────────────────────────────

export const vacancies = pgTable("vacancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  shortCode: text("short_code").unique(), // "2604V001" — YYMM(created_at) + 'V' + порядковый
  title: text("title").notNull(),
  description: text("description"),
  city: text("city"),
  format: text("format"), // 'office' | 'hybrid' | 'remote'
  employment: text("employment"), // 'full' | 'part'
  category: text("category"),
  sidebarSection: text("sidebar_section"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  status: text("status").default("draft"), // 'draft' | 'published' | 'paused' | 'closed'
  slug: text("slug").unique().notNull(),
  descriptionJson: jsonb("description_json"),
  requiredExperience: text("required_experience"), // 'none' | '1-3' | '3-6' | '6+'
  employmentType: text("employment_type").array(), // ['ТК РФ', 'ГПХ', ...]
  schedule: text("schedule"), // '5/2' | '2/2' | 'free' | 'shift' | 'rotation' | 'other'
  hiringPlan: integer("hiring_plan").default(1),
  employeeType: text("employee_type").default("permanent"), // 'permanent' | 'temporary'
  clientCompanyId: uuid("client_company_id").references(() => salesCompanies.id, { onDelete: "set null" }),
  clientContactId: uuid("client_contact_id").references(() => salesContacts.id, { onDelete: "set null" }),
  hhVacancyId: text("hh_vacancy_id"),
  hhUrl: text("hh_url"),
  hhSyncedAt: timestamp("hh_synced_at"),
  // Состояние публикации на hh (обновляется синком hh-vacancy-sync):
  // hhArchived = вакансии нет в /vacancies/active (ушла в архив hh ~через 30 дн).
  // hhExpiresAt — срок публикации, если hh его отдаёт (часто null).
  hhArchived:  boolean("hh_archived"),
  hhExpiresAt: timestamp("hh_expires_at", { withTimezone: true }),
  // Дата ПЕРВОЙ публикации вакансии на hh (published_at/created_at из детали
  // /vacancies/{id}). Заполняет крон hh-vacancy-sync. Используется в шапке
  // вакансии для счётчика «X дн.» (сколько вакансия висит на hh). Fallback на
  // vacancies.created_at, если у вакансии нет hh-привязки или синк ещё не прошёл.
  hhPublishedAt: timestamp("hh_published_at", { withTimezone: true }),
  // Дата, когда МЫ закрыли вакансию (status → archived/closed). Может отличаться
  // от hhArchived: на hh уже архив, а у нас ещё ведём кандидатов.
  closedAt:    timestamp("closed_at", { withTimezone: true }),
  // Счётчики воронки hh (из /negotiations collections) — точные числа из
  // интерфейса hh: { response, phone_interview, assessment, interview, offer,
  // hired, discard_by_employer, discard_by_applicant, ... }. Обновляет крон
  // hh-vacancy-sync. Отчёт показывает их в hh-колонках (точь-в-точь как hh),
  // т.к. items-эндпоинт отдаёт неполно (скрытые резюме).
  hhFunnelJson: jsonb("hh_funnel_json"),
  aiProcessSettings: jsonb("ai_process_settings").default({}),
  aiScoringEnabled: boolean("ai_scoring_enabled").notNull().default(false),
  // «Портрет» — единственный источник оценки для этой вакансии (новый контур).
  // true: критерии + пороги + жёсткость берутся из vacancy_specs (Spec).
  // false (дефолт): прежнее legacy-поведение. Новые вакансии создаются с true;
  // существующие переводятся вручную кнопкой «Перенести в Портрет».
  portraitScoring: boolean("portrait_scoring").notNull().default(false),
  // P0-22: editable стоп-слова на уровне вакансии.
  // Стоп-слова (дефолт, бриф Юрия 27.06): только отрицательные формы. Убраны
  // слишком широкие «нет»/«спасибо» (вежливый кандидат пишет «спасибо»!). Матчить
  // только отрицания; «интересно/подходит/актуально» БЕЗ отрицания — НЕ отказ.
  stopWordsJson: jsonb("stop_words_json").$type<string[]>().notNull().default([
    "неактуально","не подходит","неинтересно","не интересно","не интересует",
    "не актуально","не актуальна","отменяю","отказ","отказываюсь",
    "не рассматриваю","уже работаю","нашёл работу","передумал",
  ]),
  // P0-28: кеш AI-оценки вакансии (vacancy-advisor).
  aiQualityScore:        integer("ai_quality_score"),
  aiQualityDetails:      jsonb("ai_quality_details"),
  aiQualityAnalyzedAt:   timestamp("ai_quality_analyzed_at", { withTimezone: true }),
  aiQualityInputHash:    text("ai_quality_input_hash"),
  // #46: Аварийное повторное сообщение.
  recoveryMessageEnabled: boolean("recovery_message_enabled").notNull().default(false),
  recoveryMessageText:    text("recovery_message_text").notNull().default(""),
  // Настраиваемый текст приглашения на интервью (ссылка /schedule/[token]).
  // Пусто → используется DEFAULT_SCHEDULE_INVITE_TEXT (lib/messaging/schedule-invite.ts).
  // Плейсхолдеры: {{name}} {{vacancy}} {{company}} {{schedule_link}} {{manager}}.
  scheduleInviteText:     text("schedule_invite_text").notNull().default(""),
  // #21: серия из до 3 первых сообщений с тумблерами и задержками.
  firstMessagesChain: jsonb("first_messages_chain")
    .$type<Array<{ enabled: boolean; delaySeconds: number; text: string }>>()
    .notNull()
    .default([]),
  // Альтернативный текст Сообщения 1 для нерабочего времени (drizzle/0140).
  // Если кандидат откликнулся вне рабочих часов вакансии (canSendNow=false)
  // и off-hours включён — шлётся этот текст вместо основного, без Сообщений 2/3.
  firstMessageOffHoursEnabled:      boolean("first_message_off_hours_enabled").notNull().default(true),
  firstMessageOffHoursDelaySeconds: integer("first_message_off_hours_delay_seconds").notNull().default(15),
  firstMessageOffHoursText:         text("first_message_off_hours_text"),
  // #15: AI чат-бот кандидатов.
  aiChatbotEnabled:  boolean("ai_chatbot_enabled").notNull().default(false),
  aiChatbotSettings: jsonb("ai_chatbot_settings").notNull().default({}),
  aiChatbotPrompt:   text("ai_chatbot_prompt").notNull().default(""),
  // #61: per-vacancy стоп-факторы.
  stopFactorsJson:   jsonb("stop_factors_json").$type<VacancyStopFactors>().notNull().default({}),
  // Группа 25: структурированные требования (must_have / nice_to_have /
  // deal_breakers / ideal_profile / scoring_weights). Используются
  // двухпроходным AI-скорингом v2 (lib/ai-score-candidate-v2.ts).
  // Если must_have пустой — работает только v1.
  requirementsJson:  jsonb("requirements_json").$type<VacancyRequirements>().default({}),
  // Funnel Builder MVP: экспериментальный конструктор воронки (см. drizzle/0127).
  // funnelBuilderEnabled выключен по умолчанию; cron'ы и старые компоненты
  // продолжают читать существующие поля (aiChatbotEnabled и т.д.).
  funnelBuilderEnabled: boolean("funnel_builder_enabled").notNull().default(false),
  // Группа 38: false — вакансия наследует брендинг компании (default).
  // true — используется собственный описанный в description_json.branding.
  brandingOverrideEnabled: boolean("branding_override_enabled").notNull().default(false),
  funnelConfigJson:     jsonb("funnel_config_json")
    .$type<{ blocks: Array<{ type: string; order: number; enabled: boolean }> }>()
    .notNull()
    .default({ blocks: [] }),
  // Phase 3 консолидации: отдельный флаг — читает ли РАНТАЙМ воронку из
  // funnelConfigJson (а не legacy-полей). По умолчанию false → поведение не
  // меняется. Включается точечно (полигон), обратимо. См. drizzle/0166 и
  // lib/funnel-builder/runtime.ts (isBlockEnabled).
  funnelRuntimeEnabled: boolean("funnel_runtime_enabled").notNull().default(false),
  // drizzle/0226 — Фаза 0 рантайма воронки v2. Отдельный флаг от funnelRuntimeEnabled
  // (который управляет блоками Funnel Builder). false (дефолт) = легаси-путь для
  // всех кандидатов; true = новые кандидаты идут через v2-рантайм.
  // Включать только на полигон-вакансиях (Ф1); Орлинк/ИП не трогать.
  funnelV2RuntimeEnabled: boolean("funnel_v2_runtime_enabled").notNull().default(false),
  // Авто-разбор hh-откликов: cron каждые 10 минут разбирает накопленные отклики
  // в рабочее время. Если выключено — клиент жмёт «Разобрать» вручную.
  autoProcessingEnabled:      boolean("auto_processing_enabled").notNull().default(false),
  // Расписание отправки сообщений (часы + дни + праздники).
  // Логика — lib/schedule/can-send-now.ts.
  scheduleEnabled:            boolean("schedule_enabled").notNull().default(true),
  scheduleStart:              text("schedule_start").notNull().default("09:00"),
  scheduleEnd:                text("schedule_end").notNull().default("18:30"),
  scheduleTimezone:           text("schedule_timezone").notNull().default("Europe/Moscow"),
  // 1=Пн ... 7=Вс. Default — Пн-Пт (рабочая неделя, решение Юрия 26.06).
  scheduleWorkingDays:        jsonb("schedule_working_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  // Идентификаторы из RU_HOLIDAYS — даты, в которые блокируется отправка.
  scheduleExcludedHolidayIds: jsonb("schedule_excluded_holiday_ids").$type<string[]>().notNull().default([
    "dec_31", "jan_1", "jan_2", "jan_3", "jan_4", "jan_5", "jan_6", "jan_7", "jan_8",
    "feb_23", "mar_8", "may_1", "may_9", "jun_12", "nov_4",
  ]),
  // Кастомные периоды (например, корпоративные отпуска). { from: "YYYY-MM-DD", to, label }.
  scheduleCustomHolidays:     jsonb("schedule_custom_holidays").$type<{ from: string; to: string; label: string }[]>().notNull().default([]),
  // Обеденный перерыв (миграция 0216): если включён — в указанный промежуток отправка блокируется.
  // По умолчанию false → поведение существующих вакансий не меняется.
  scheduleLunchEnabled:        boolean("schedule_lunch_enabled").notNull().default(false),
  scheduleLunchFrom:           text("schedule_lunch_from").notNull().default("13:00"),
  scheduleLunchTo:             text("schedule_lunch_to").notNull().default("14:00"),
  // Страна для определения праздничного календаря (миграция 0216).
  // "RU" — старая логика RU_HOLIDAYS+excludedIds. Остальные страны — getHolidaysForCountry().
  scheduleCountry:             text("schedule_country").notNull().default("RU"),
  // Источники откликов на вакансию (миграция 0191).
  // Определяет, с каких площадок принимаются отклики.
  // Дефолт ['hh'] — существующие вакансии работают как раньше.
  // При добавлении 'avito' система начинает принимать входящие из Авито Messenger.
  channelSources:             jsonb("channel_sources").$type<Array<"hh" | "avito">>().notNull().default(["hh"]),
  // Пауза исходящей очереди сообщений (дожимы/приглашения/тесты).
  // Когда true — cron follow-up пропускает все pending-сообщения этой вакансии.
  // HR управляет через секцию «Очередь сообщений» в настройках вакансии.
  outboundPaused: boolean("outbound_paused").notNull().default(false),
  // Уровень 3 интеграций: per-vacancy override.
  // enabled=true → используются поля ниже вместо company-level.
  // enabled=false/undefined (дефолт) → наследуем настройки компании.
  integrationsOverride: jsonb("integrations_override")
    .$type<{
      enabled?: boolean
      webhooks?: { url?: string; events?: Record<string, boolean> }
      bitrix?:   { url?: string; trigger?: string }
    }>()
    .notNull()
    .default({}),
  // Счётчики AI-токенов по всем вызовам, атрибутированным к вакансии.
  // Обновляются атомично через addVacancyTokens (lib/ai/token-usage.ts).
  // mode:"number" — безопасно при значениях до ~2^53 (хватит на много лет).
  aiTokensIn:  bigint("ai_tokens_in",  { mode: "number" }).notNull().default(0),
  aiTokensOut: bigint("ai_tokens_out", { mode: "number" }).notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export interface VacancyPrequalificationQuestion {
  text:      string
  required:  boolean   // false = информативный
  criterion: string    // что считается «правильным ответом» для AI (опц.)
}

// #61: per-vacancy стоп-факторы. Все поля опциональны — отсутствие ключа
// = выключен. enabled=false тоже = выключен. См. drizzle/0125.
export interface VacancyStopFactorCity {
  enabled:         boolean
  allowedCities?:  string[]   // если кандидат НЕ из списка → стоп
  allowRelocation?: boolean   // и НЕ отметил «готов к переезду»
  rejectionText?:  string
}
export interface VacancyStopFactorFormat {
  enabled:         boolean
  allowedFormats?: Array<"office" | "hybrid" | "remote">
  rejectionText?:  string
}
export interface VacancyStopFactorAge {
  enabled:         boolean
  minAge?:         number
  maxAge?:         number
  rejectionText?:  string
}
export interface VacancyStopFactorExperience {
  enabled:         boolean
  minYears?:       number
  rejectionText?:  string
}
export interface VacancyStopFactorDocuments {
  enabled:         boolean
  required?:       string[]   // напр. ["med_book", "driver_license_b"]
  rejectionText?:  string
}
export interface VacancyStopFactorCitizenship {
  enabled:         boolean
  /** "allow" — пропускаем только allowed (дефолт, легаси-поведение при
   *  отсутствии поля); "deny" — пропускаем всех, кроме denied. */
  mode?:           "allow" | "deny"
  allowed?:        string[]   // allow-режим: напр. ["RU", "BY"]
  /** deny-режим: ISO-2 коды и/или континент-коды вида "continent:europe",
   *  "continent:cis" — разворачиваются в матчере (см. stop-factors-matcher.ts). */
  denied?:         string[]
  rejectionText?:  string
}
export interface VacancyStopFactorSalary {
  enabled:         boolean
  maxAmount?:      number     // в рублях
  rejectionText?:  string
}
// Родной язык кандидата — ПОЛНАЯ КОПИЯ VacancyStopFactorCitizenship по
// структуре (03.07), но домен = hh resume.language[] с level.id==="l1"
// (родной), а не гражданство. Континентов/групп у языков нет — плоский
// список кодов (см. lib/funnel-builder/native-languages.ts).
export interface VacancyStopFactorNativeLanguage {
  enabled:         boolean
  /** "allow" — пропускаем только allowed (дефолт при отсутствии поля);
   *  "deny" — пропускаем всех, кроме denied. */
  mode?:           "allow" | "deny"
  allowed?:        string[]   // allow-режим: напр. ["rus", "bel"]
  denied?:         string[]   // deny-режим: напр. ["eng", "ger"]
  rejectionText?:  string
}
export interface VacancyStopFactors {
  city?:               VacancyStopFactorCity
  format?:             VacancyStopFactorFormat
  age?:                VacancyStopFactorAge
  experience?:         VacancyStopFactorExperience
  documents?:          VacancyStopFactorDocuments
  citizenship?:        VacancyStopFactorCitizenship
  nativeLanguage?:     VacancyStopFactorNativeLanguage
  salaryExpectation?:  VacancyStopFactorSalary
  /** Единый текст отказа на ВЕСЬ блок стоп-факторов (Юрий 08.07). Пусто → нейтральный дефолт в matcher. Плейсхолдеры {{name}}/{{vacancy}}/{{company}}. */
  rejectionText?:      string
}

// ─── Группа 25: структурированные требования вакансии ──────────────────────
// Используются двухпроходным AI-скорингом v2 (lib/ai-score-candidate-v2.ts).
// must_have ≥ 1 — активирует v2 (запуск параллельно с v1, A/B сравнение).

export interface ScoringWeights {
  relevant_experience: number   // default 30
  hard_skills:         number   // default 25
  tenure_stability:    number   // default 10
  results_in_numbers:  number   // default 10
  soft_skills_fit:     number   // default 10
  company_size_match:  number   // default 5
  managerial_match:    number   // default 5
  education:           number   // default 3
  location_readiness:  number   // default 2
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  relevant_experience: 30,
  hard_skills:         25,
  tenure_stability:    10,
  results_in_numbers:  10,
  soft_skills_fit:     10,
  company_size_match:  5,
  managerial_match:    5,
  education:           3,
  location_readiness:  2,
}

export interface VacancyRequirements {
  must_have?:                    string[]   // 3-5 жёстких
  nice_to_have?:                 string[]   // до 5 желательных
  deal_breakers?:                string[]   // до 3
  ideal_profile?:                string     // 1-2 предложения
  scoring_weights?:              ScoringWeights
  ai_suggested_at?:              string
  hr_edited_after_suggestion?:   boolean
}

// Результат двухпроходного скоринга v2 — сохраняется в candidates.aiScoreV2Details.
// Полный JSON см. lib/ai-score-candidate-v2.ts.
export interface CandidateScoreV2 {
  score:    number                                          // 0-100, взвешенная сумма
  decision: "strong_match" | "match" | "maybe" | "weak" | "reject"
  extracted_facts: {
    total_years_experience:  number | null
    relevant_experience:     Array<{ role: string; years: number; industry: string | null }>
    industry_match:          "exact" | "adjacent" | "different" | "unknown"
    hard_skills_mentioned:   string[]
    soft_skills_evidence:    string[]
    managerial_experience:   { has: boolean; team_size: number | null }
    avg_tenure_years:        number | null
    company_sizes_worked:    string[]
    results_with_numbers:    string[]
    red_flags:               string[]
    green_flags:             string[]
    education_summary:       string | null
  }
  criteria_scores: {
    relevant_experience: number
    hard_skills:         number
    tenure_stability:    number
    results_in_numbers:  number
    soft_skills_fit:     number
    company_size_match:  number
    managerial_match:    number
    education:           number
    location_readiness:  number
  }
  reasoning: {
    pros:                    string[]
    cons:                    string[]
    questions_for_interview: string[]
  }
  matched_must_have:        string[]
  missed_must_have:         string[]
  matched_nice_to_have:     string[]
  triggered_deal_breakers:  string[]
  scored_at?:               string
}

export interface VacancyPrequalificationConfig {
  enabled?:      boolean
  questions?:    VacancyPrequalificationQuestion[]   // max 3
  reminderD1?:   string                              // напоминание Д+1
  reminderD3?:   string                              // напоминание Д+3
  fallbackDays?: number                              // default 5
}

export interface VacancyAiProcessSettings {
  /**
   * Нижний порог скоринга. Резюме со score < этого — мягкий отказ.
   * Legacy alias: minScore (читается как fallback при отсутствии нового поля).
   */
  minScoreLower?:        number
  /** Verхний порог. Резюме со score >= этого — сразу invite. */
  minScoreUpper?:        number
  /** Что делать со средними резюме (lower..upper). По умолчанию prequalification. */
  midRangeAction?:       "prequalification" | "direct_demo" | "keep_new"
  /** Конфиг блока «Предквалификация» из таба «Демо и воронка». */
  prequalification?:     VacancyPrequalificationConfig
  /**
   * ТЗ-3 Ч.2: глобальный режим воронки. Приоритет над midRangeAction.
   *   - "direct_demo"       — кандидаты сразу получают demo-ссылку (дефолт).
   *   - "prequal_then_demo" — сначала AI-вопросы предквалификации, при
   *                          passed/no_answer → demo, при failed → reject.
   *   - "prequal_only"      — только предквалификация без demo; после
   *                          ответов кандидат → anketa_filled (для HR).
   * По умолчанию "direct_demo" — для существующих вакансий ничего не меняется.
   */
  prequalificationMode?: "direct_demo" | "prequal_then_demo" | "prequal_only"

  /**
   * Задержка отказа в минутах (drizzle/0155). Все авто-отказы откладываются на
   * это время и исполняются cron'ом в рабочее время вакансии. 0 = мгновенно.
   * Дефолт 300 (5 ч) — отклик утром → отказ ~к обеду. Применяется ко ВСЕМ
   * причинам (стоп-факторы, провал предкв, «не интересно» в чате, security).
   */
  rejectionDelayMinutes?: number

  // ── Legacy (Сессии 1-5), оставлены для совместимости ────────────────
  /** @deprecated → переименовано в minScoreLower; пишем оба для backward compat. */
  minScore?:             number
  /** @deprecated → заменено на midRangeAction. */
  belowThresholdAction?: "reject" | "keep_new"

  inviteMessage?:    string
  reInviteMessage?:  string
  rejectMessage?:    string
  // Юрий 10.07: текст, который уходит кандидату, когда менеджер отменяет
  // назначенное интервью (не отказ — приглашение перезаписаться на новое время).
  interviewCancelledMessage?: string
  // Юрий 10.07: текст при вставке/смене ссылки на встречу (Zoom и т.п.) —
  // {{name}}/{{vacancy}}/{{meeting_link}}/{{contacts}}.
  meetingLinkMessage?: string
  // Юрий 10.07: пилот «агента коммуникаций» — AI переписывает УЖЕ
  // отрендеренный текст дожима под контекст кандидата, оставаясь в рамках
  // заготовки HR (lib/comms-agent/adapt-followup-message.ts). ВЫКЛ по
  // умолчанию у всех вакансий — не включать без отдельного решения Юрия,
  // пилот только на дожимах, НЕ на отказах (см. memory
  // legal-rejection-texts-neutral-keep-autoreject).
  dozhimAgentEnabled?: boolean

  // ── Funnel Builder soft-флаги (зеркалятся из funnel_config_json,
  //    см. funnel-config/route.ts). undefined/отсутствует = включено
  //    (обратная совместимость со старыми вакансиями). Только явный false
  //    выключает соответствующий блок воронки на бэкенде. ──
  stopFactorsEnabled?:       boolean
  aiAnketaScoreEnabled?:     boolean
  stopWordsChatEnabled?:     boolean
  testTaskAutoReplyEnabled?: boolean

  // D5 (Phase 4): тумблер авто-отказа по AI-скору резюме. По умолчанию ВЫКЛ
  // (P0-14): кандидаты ниже порога идут в keep_new (ручной разбор), отказ НЕ
  // отправляется. true — HR осознанно включил реальный авто-отказ; это OUTWARD
  // (discard_by_employer через hh кандидату). См. process-queue.ts.
  autoRejectEnabled?:        boolean
}

// ── Резерв (Talent Pool) → Рефералы (drizzle/0167) ──
// Реферальные ссылки сотрудников: company24.pro/ref/{slug}. Счётчики кликов/
// приведённых/нанятых растут по мере перехода и найма. Бонус считается в UI
// как hired_count * companies.hiringDefaultsJson.referralRules.bonusPerHire.
export const referralLinks = pgTable("referral_links", {
  id:            uuid("id").defaultRandom().primaryKey(),
  companyId:     uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  position:      text("position").notNull().default(""),
  slug:          text("slug").notNull(),
  clicks:        integer("clicks").notNull().default(0),
  referredCount: integer("referred_count").notNull().default(0),
  hiredCount:    integer("hired_count").notNull().default(0),
  createdAt:     timestamp("created_at").defaultNow(),
})

// ── Резерв (Talent Pool) → Кампании прогрева (drizzle/0168) ──
// Управляемая сущность кампании: канал + статус + счётчики воронки
// (отправлено/открыто/ответили). Реальная ОТПРАВКА касаний кандидатам —
// отдельная фича (outward, под флагом); сейчас кампания создаётся/паузится,
// счётчики стартуют с 0 и растут, когда подключим рассылку.
export const talentCampaigns = pgTable("talent_campaigns", {
  id:           uuid("id").defaultRandom().primaryKey(),
  companyId:    uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name:         text("name").notNull(),
  status:       text("status").notNull().default("active"),  // 'active' | 'paused'
  channel:      text("channel").notNull().default("email"),  // 'email' | 'telegram' | 'both'
  sentCount:    integer("sent_count").notNull().default(0),
  openedCount:  integer("opened_count").notNull().default(0),
  repliedCount: integer("replied_count").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

// ── Резерв (Talent Pool) → ручные/CSV записи «Базы» (drizzle/0169) ──
// Пассивные кандидаты, добавленные вручную или импортом CSV (НЕ из откликов на
// вакансию). Кандидаты-из-вакансий (стадия talent_pool) живут в candidates и
// мёрджатся в UI отдельно. Здесь — свои поля должность/компания/источник.
export const talentPoolEntries = pgTable("talent_pool_entries", {
  id:          uuid("id").defaultRandom().primaryKey(),
  companyId:   uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  position:    text("position").notNull().default(""),
  company:     text("company").notNull().default(""),
  source:      text("source").notNull().default(""),
  email:       text("email").notNull().default(""),
  phone:       text("phone").notNull().default(""),
  telegram:    text("telegram").notNull().default(""),
  comment:     text("comment").notNull().default(""),
  score:       integer("score").notNull().default(0),
  status:      text("status").notNull().default("cold"),  // cold|warming|hot|ideal
  createdAt:   timestamp("created_at").defaultNow(),
  // Жизненный цикл (миграция 0228): «Не подходит» → archivedAt; Архив → Корзина → trashedAt.
  archivedAt:  timestamp("archived_at"),
  trashedAt:   timestamp("trashed_at"),
})

// ── Резерв (Talent Pool) → Формы (drizzle/0170) ──
// Определения форм сбора кандидатов (внешние/внутренние). Поля формы — в
// fields_json. Публичная отправка формы (inbound) — отдельная фича.
export interface TalentFormField { key: string; label: string; enabled: boolean; required: boolean; locked?: boolean }

// ── Резерв → Формы: tracking-ссылки (drizzle/0171) ──
// Короткая ссылка /f/{slug} для отслеживания источника. Ведёт на публичную
// форму (опционально конкретную talent_form). Кандидат заполняет → запись в
// talent_pool_entries + инкремент counters.
export const formTrackingLinks = pgTable("form_tracking_links", {
  id:         uuid("id").defaultRandom().primaryKey(),
  companyId:  uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  formId:     uuid("form_id").references(() => talentForms.id, { onDelete: "set null" }),
  source:     text("source").notNull().default(""),
  name:       text("name").notNull().default(""),
  slug:       text("slug").notNull(),
  clicks:     integer("clicks").notNull().default(0),
  candidates: integer("candidates").notNull().default(0),
  createdAt:  timestamp("created_at").defaultNow(),
})

export const talentForms = pgTable("talent_forms", {
  id:               uuid("id").defaultRandom().primaryKey(),
  companyId:        uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name:             text("name").notNull(),
  type:             text("type").notNull().default("external"),  // 'external' | 'internal'
  source:           text("source").notNull().default(""),
  placement:        text("placement").notNull().default(""),
  slug:             text("slug").notNull().default(""),
  slogan:           text("slogan").notNull().default(""),
  fieldsJson:       jsonb("fields_json").$type<TalentFormField[]>().notNull().default([]),
  active:           boolean("active").notNull().default(true),
  applicationsCount: integer("applications_count").notNull().default(0),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
})

export const demos = pgTable("demos", {
  id: uuid("id").primaryKey().defaultRandom(),
  vacancyId: uuid("vacancy_id").references(() => vacancies.id).notNull(),
  // Этап 2.5: дискриминатор материала вакансии. 'demo' — демонстрация
  // должности (таб «Демонстрация»), 'test' — тестовое задание (таб «Тест»).
  // Одна запись на (vacancy_id, kind). Миграция 0142.
  kind: text("kind").notNull().default("demo"), // 'demo' | 'test' | 'block:<uuid>'
  title: text("title").notNull(),
  status: text("status").default("draft"), // 'draft' | 'published'
  lessonsJson: jsonb("lessons_json").notNull().default("[]"),
  postDemoSettings: jsonb("post_demo_settings").default({}),
  // Миграция 0179: динамические блоки контента
  sortOrder: integer("sort_order").notNull().default(0),
  contentType: text("content_type").notNull().default("presentation"), // 'presentation' | 'test' | 'task'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Ответы кандидатов на тестовое задание (публичная /test/[token]). Миграция 0144.
// ai_score/ai_reasoning заполняются на Этапе 2 (AI-скоринг).
export const testSubmissions = pgTable("test_submissions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "cascade" }).notNull(),
  demoId:      uuid("demo_id").references(() => demos.id, { onDelete: "set null" }),
  answerText:  text("answer_text"),
  fileUrl:     text("file_url"),
  // Структурированные ответы кандидата на вопросы task-блоков теста.
  // Формат: { answers: StructuredAnswer[], objective: ObjectiveResult|null,
  //           scoringStatus?: 'pending'|'done'|'failed'|'manual',
  //           scoringAttempts?: number }.
  // scoringStatus (05.07) — состояние фонового AI-скоринга свободных ответов
  // (processTestScoring в lib/ai-score-test.ts, вызывается из
  // app/api/public/test/[token]/submit/route.ts и cron test-scoring-retry):
  //   pending — AI ещё считает (или ждёт ретрая после временного сбоя)
  //   done    — балл посчитан успешно
  //   failed  — все ретраи прогона исчерпаны, балл не посчитан (HR видит «оцен…»)
  //   manual  — testCheckMode='manual', AI не запускается, ждёт ручной проверки HR
  // scoringAttempts — число прогонов processTestScoring; при
  // >= MAX_SCORING_ATTEMPTS cron перестаёт подбирать запись (потолок токенов).
  // Без этих полей балл оставался null навсегда без индикации причины —
  // cron test-scoring-retry подбирает pending/failed старше 10 минут.
  // У старых записей (до 05.07) ключей нет — cron их не трогает, UI показывает
  // «сдан», как раньше.
  answersJson: jsonb("answers_json"),
  aiScore:     integer("ai_score"),
  aiReasoning: text("ai_reasoning"),
  submittedAt: timestamp("submitted_at").defaultNow(),
})

export interface PostDemoSettings {
  enabled?: boolean
  mode?: "auto" | "manual"
  // Именованные шаблоны для рассылки через hh (менеджер шаблонов в hh-broadcast-dialog).
  // Хранят текст С ПЛЕЙСХОЛДЕРАМИ ({{name}}/{{vacancy}}/{{test_link}}).
  broadcastTemplates?: { id: string; name: string; text: string }[]
  // Thresholds
  upperThreshold?: number
  lowerThreshold?: number
  // Green level
  greenTitle?: string
  meetPhone?: boolean
  meetOnline?: boolean
  meetOffice?: boolean
  officeAddress?: string
  // Yellow level
  yellowTitle?: string
  yellowText?: string
  // Red level
  redTitle?: string
  redText?: string
  // Manual mode
  manualTitle?: string
  manualText?: string
  manualButton?: string
  manualButtonEnabled?: boolean
  greenButtonEnabled?: boolean
  // Финальная анкета — тумблер-оверрайд (полный выключатель).
  // false = анкета НИКОГДА не показывается (после уроков сразу статичный «спасибо»).
  // true / undefined = анкета РАЗРЕШЕНА; фактический показ решается «умным» правилом
  //   на /demo/[token]: показываем только если у кандидата ЕЩЁ НЕТ контактов
  //   (нет email и нет телефона). У кандидата с hh-контактами анкета пропускается —
  //   её смысл собрать контакты, а они уже есть. Дефолт undefined = ВКЛ (умное правило).
  anketaEnabled?: boolean
  // Финальная анкета — настройка полей
  formFields?: {
    firstName?: { enabled: boolean; required: boolean }
    lastName?: { enabled: boolean; required: boolean }
    email?: { enabled: boolean; required: boolean }
    phone?: { enabled: boolean; required: boolean }
    telegram?: { enabled: boolean; required: boolean }
    birthDate?: { enabled: boolean; required: boolean }
    city?: { enabled: boolean; required: boolean }
  }
  // ТЗ-3 Ч.1: автоответ после заполнения финальной анкеты с предложением
  // тестового задания. Отдельный одиночный touch (branch=anketa_auto_reply),
  // не цепочка дожима. Не путать с anketaConfirmation (короткое «спасибо»).
  anketaAutoReply?: AnketaAutoReplySettings

  // Этап 2.6: настройки блока воронки «Тестовое задание». Хранятся в
  // postDemoSettings записи demos с kind='test' (контент теста — в её
  // lessonsJson). Так блок воронки и таб «Тест» используют одну запись.
  // (DEPRECATED источник — descriptionJson.testTask; читается как fallback.)
  testTaskInstructions?: string
  testDeadlineDays?:     number
  testAiCheck?:          boolean
  testResponseFormat?:   "text" | "file" | "both"

  // Этап 2 (AI-скоринг теста). Все поля опциональны — обратная совместимость:
  //   testCheckMode  undefined → 'assisted' (AI оценивает, стадию решает HR)
  //   testAiPrompt   undefined → дефолтный промпт оценки (lib/ai-score-test.ts)
  //   testPassingScore undefined → 70
  //   testAfterMessage undefined/'' → сообщение после теста не отправляется
  testCheckMode?:   "auto" | "assisted" | "manual"
  testAiPrompt?:    string
  testPassingScore?: number
  testAfterMessage?: string   // плейсхолдеры {{name}}, {{vacancy}}
  // Мини-фича рассылки теста (01.06.2026): текст приглашения, которое HR шлёт
  // выбранным кандидатам (branch=test_invite). Плейсхолдеры {{name}},
  // {{vacancy}}, {{test_link}} (персональная ссылка /test/{token}).
  // undefined/'' → дефолтный текст из lib/messaging/test-invite.ts.
  testInviteMessage?: string
  // Тест-дожим: напоминания тем, кто получил тест, но не сдал. undefined →
  // выключено. testReminderDays — смещения от отправки теста (Д+N); undefined →
  // дефолт [1,3,6]. testReminderMessages — тексты по порядку (плейсхолдеры
  // {{name}}/{{vacancy}}/{{test_link}}); undefined → дефолтные.
  testReminderEnabled?:  boolean
  testReminderDays?:     number[]
  testReminderMessages?: string[]
  // Флаг «боевого» тест-блока или демо-блока конструктора. Только один блок
  // с contentType='test' на вакансию может быть боевым (isLiveBattle=true).
  // При сохранении боевого тест-блока API делает upsert записи kind='test';
  // при удалении — переводит kind='test' в status='draft'. Аналогично для демо.
  isLiveBattle?: boolean

  // Цвет кнопок навигации «Далее/Назад» у кандидата. undefined/null → бренд-цвет компании.
  navButtonColor?: string
  // Текст кнопки «Далее» у кандидата. undefined/'' → «Далее».
  navButtonText?: string
  // Системная нижняя панель «Назад/Завершить» у кандидата.
  // true = показывать всегда; false = скрыть всегда;
  // undefined (АВТО) = показывать только если уроков > 1.
  showSystemNav?: boolean
}

export interface AnketaAutoReplySettings {
  enabled?:         boolean   // тумблер ВКЛ/ВЫКЛ, default false
  // #59: новые пресеты в секундах (10с/30с/1м/3м/5м/15м/30м/1ч).
  delaySeconds?:    10 | 30 | 60 | 180 | 300 | 900 | 1800 | 3600
  // Legacy в минутах — оставлен для backward-compat при чтении старых
  // descriptionJson. Новые клиенты пишут delaySeconds; читатели сначала
  // смотрят delaySeconds, потом делают fallback на delayMinutes * 60.
  delayMinutes?:    5 | 15 | 30 | 60 | 240 | 1440
  respectSchedule?: boolean   // учитывать рабочее окно вакансии, default true
  text?:            string    // текст сообщения с плейсхолдерами
  testTaskUrl?:     string    // опциональная ссылка, дописывается в конец текста
}

export const ANKETA_AUTO_REPLY_DELAYS_SECONDS = [10, 30, 60, 180, 300, 900, 1800, 3600] as const
// Legacy — больше не используется в UI, оставлен для совместимости.
export const ANKETA_AUTO_REPLY_DELAYS = [5, 15, 30, 60, 240, 1440] as const
export const DEFAULT_ANKETA_AUTO_REPLY_TEXT =
  "{{name}}, рассмотрели вашу анкету. Ваша кандидатура нам интересна. Предлагаем тестовое задание."

export type FormFieldKey = "firstName" | "lastName" | "email" | "phone" | "telegram" | "birthDate" | "city"

// ── TgMessage (drizzle/0198) ──
// Одно сообщение в TG-переписке HR ↔ кандидат. Хранится в candidates.tg_messages[].
export interface TgMessage {
  role:    "hr" | "candidate"
  text:    string
  sentAt:  string  // ISO 8601
}

export const DEFAULT_FORM_FIELDS: Required<NonNullable<PostDemoSettings["formFields"]>> = {
  firstName: { enabled: true, required: true },
  lastName:  { enabled: true, required: true },
  email:     { enabled: true, required: true },
  phone:     { enabled: true, required: true },
  telegram:  { enabled: true, required: false },
  birthDate: { enabled: true, required: false },
  city:      { enabled: true, required: false },
}

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  vacancyId: uuid("vacancy_id").references(() => vacancies.id).notNull(),
  name: text("name").notNull(),
  // Ручная коррекция ИМЕНИ для подстановки {{name}} в сообщения. Когда задано —
  // имеет высший приоритет над hh/словарём (HR поправил в ревизии очереди, напр.
  // когда hh-поля перепутаны). NULL = определяем автоматически (pickGivenName).
  firstNameOverride: text("first_name_override"),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  source: text("source"), // 'hh' | 'avito' | 'telegram' | 'site' | 'referral' | 'manual'
  // Воронка: 'new' | 'primary_contact' | 'demo_opened' | 'demo' (legacy)
  // | 'decision' (= «Демо пройдено» в UI) | 'anketa_filled'
  // | 'ai_screening' | 'interview' | 'final_decision' | 'scheduled'
  // | 'interviewed' | 'hired' | 'rejected' | 'wants_contact'
  stage: text("stage").default("new"),
  // Дата ПОСЛЕДНЕГО отклика (повторный отклик, напр. на перепубликованную
  // вакансию). NULL = откликался один раз; первый отклик — в created_at.
  lastRespondedAt: timestamp("last_responded_at", { withTimezone: true }),
  // Вид интервью, выбранный HR при приглашении: 'phone' | 'zoom' | 'office'
  // (Звонок | Онлайн | В офис). NULL = вид из воронки/дефолта компании.
  interviewMode: text("interview_mode"),
  score: integer("score"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  // Валюта ожидаемой зарплаты (RUR/RUB/EUR/USD/...). NULL — RUB по умолчанию.
  salaryCurrency: text("salary_currency"),
  experience: text("experience"),
  skills: text("skills").array().default([]),
  // HR-020: новые поля для рабочих фильтров списка кандидатов.
  birthDate: date("birth_date"),
  experienceYears: integer("experience_years"),
  workFormat: text("work_format"),                              // 'office'|'hybrid'|'remote'
  educationLevel: text("education_level"),                      // 'secondary'|'specialized'|'higher'|'mba'
  languages: text("languages").array().default([]),
  keySkills: text("key_skills").array().default([]),
  industry: text("industry"),
  relocationReady: boolean("relocation_ready"),
  businessTripsReady: boolean("business_trips_ready"),
  // Доп. поля из hh.ru (миграция 0200): категории прав, автомобиль, гражданство,
  // разрешение на работу, желаемые профроли. Сохраняются при импорте/синке.
  driverLicenses:    text("driver_licenses").array().default([]),
  hasVehicle:        boolean("has_vehicle"),
  citizenshipNames:  text("citizenship_names").array().default([]),
  workTicketNames:   text("work_ticket_names").array().default([]),
  professionalRoles: text("professional_roles").array().default([]),
  // URL фото из hh-резюме (medium ≈ 240×240). Кешируется в БД при импорте,
  // чтобы фронт не запрашивал hh API на каждый рендер карточки кандидата.
  photoUrl: text("photo_url"),
  // Момент отправки тестового задания кандидату (рассылка hh / «Отправить тест»).
  // Драйвит ТОЛЬКО колонку «Тест» (= «отп.»), НЕ двигает воронку/стадию кандидата.
  testInviteSentAt: timestamp("test_invite_sent_at", { withTimezone: true }),
  token: text("token").unique().notNull(),
  shortId: text("short_id").unique(),                 // "2604V0010042" — vacancy.short_code + LPAD(seq,4)
  sequenceNumber: integer("sequence_number"),         // порядковый номер в рамках вакансии (0 = preview)
  demoProgressJson: jsonb("demo_progress_json"),
  anketaAnswers: jsonb("anketa_answers"), // [{question, answer}]
  // F8: «скрыть у себя» в чате — id скрытых сообщений (косметически, на нашей стороне).
  hiddenChatMsgIds: jsonb("hidden_chat_msg_ids").$type<string[]>().notNull().default([]),
  // Снимок данных, которые кандидат сам указал в анкетной форме по
  // демо-токену (firstName/lastName/phone/email/city/birthDate/telegram
  // /portfolioUrl/hhUrl/otherLinks/experienceSummary/employmentPreference
  // /niches/filledAt). Отдельно от anketa_answers — там массив демо-блоков.
  // Не перезаписывает основные поля name/phone/email/city/birth_date.
  surveyResponses: jsonb("survey_responses"),
  // 152-ФЗ (0275): согласие кандидата на обработку ПД — чекбокс в публичной
  // анкете демо (ссылка на /politicahr2026). Связка per-tenant «оператор =
  // компания-наниматель / субъект = кандидат», поэтому НЕ пишется в
  // платформенный consent_log (см. комментарий там); паттерн —
  // landing_leads.consent_at. NULL = согласие не фиксировалось (hh-импорт:
  // правовое основание — согласие кандидата на стороне hh.ru; либо анкета
  // заполнена до ввода поля). Первое согласие не перезаписывается повторными.
  consentAt: timestamp("consent_at", { withTimezone: true }),
  // Редакция политики на момент согласия: дата legal_documents('privacy_policy')
  // .updated_at, напр. "2026-07-04", либо "default", если документ не заведён.
  consentDocVersion: text("consent_doc_version"),
  aiScore: integer("ai_score"),
  aiSummary: text("ai_summary"),
  aiDetails: jsonb("ai_details"), // [{question, score, comment}]
  aiScoredAt: timestamp("ai_scored_at"),
  // Балл по ответам демо (колонка «AI-ан»). Отдельно от ai_score, чтобы не было
  // гонки: в ai_score пишут v1/v2-скоринг резюме, а сюда — lib/demo/score-answers.ts
  // (оценка task-вопросов демо против aiCriteria). 0..100, NULL = не считали. Миграция 0234.
  demoAnswersScore:   integer("demo_answers_score"),
  demoAnswersDetails: jsonb("demo_answers_details"), // [{questionText, awarded, max, comment}]
  // Пер-блочный скоринг анкеты (Вариант Б, миграция 0237): балл КАЖДОГО контент-блока
  // (демо) отдельно. Ключ = demos.id. { [demoId]: { title, score, breakdown } }.
  // demoAnswersScore остаётся = балл первого/основного блока (обратная совместимость).
  demoBlockScores:    jsonb("demo_block_scores"),
  // «2-я часть демо» (Путь менеджера) после прохождения анкеты (миграция 0236).
  // override_content_block_id — id строки demos, который показывать ИМЕННО этому
  // кандидату в /demo/[token] (перекрывает резолв на уровне вакансии). NULL = нет
  // override. second_demo_invited_at — когда отправлено приглашение (дедуп/аудит).
  overrideContentBlockId: text("override_content_block_id"),
  secondDemoInvitedAt:    timestamp("second_demo_invited_at"),
  // Группа 25: A/B сравнение скоринга v1 (scoreCandidateById) vs v2
  // (scoreCandidateV2, двухпроходный со структурированными требованиями).
  // aiScore = v2 если доступен, иначе v1 — основной для UI/фильтров.
  aiScoreV1:        real("ai_score_v1"),
  aiScoreV2:        real("ai_score_v2"),
  aiScoreV2Details: jsonb("ai_score_v2_details").$type<CandidateScoreV2>(),
  // Рубричный движок соответствия (shadow, миграция 0151). Считается параллельно
  // существующим скорерам и НЕ влияет на автодействия — для сравнения/обкатки.
  rubricScore:      integer("rubric_score"),
  rubricDetails:    jsonb("rubric_details"),     // RubricResult (lib/scoring/types)
  rubricScoredAt:   timestamp("rubric_scored_at"),
  // AI-скор по данным резюме (hh.ru / анкета) — выставляется в момент приёма
  // отклика, до демо. Шкала 0..100, NULL = не оценивали. Отдельно от aiScore
  // (он считается после прохождения демо и включает ответы на вопросы).
  resumeScore: integer("resume_score"),
  // Разбор осевого скоринга резюме (spec.scoringMode="axes") — целиком
  // AxisScoreResult: оси (score→points+evidence), штрафы, verdict, summary.
  // Нужен для блока «почему» на карточке. NULL = не считали по осям.
  aiScoreBreakdown: jsonb("ai_score_breakdown").$type<AxisScoreResult>(),
  stageHistory: jsonb("stage_history").default("[]"), // [{stage, date, note}]
  isFavorite: boolean("is_favorite").notNull().default(false),
  // Момент первого открытия страницы /demo/<shortId> владельцем-кандидатом.
  // NULL = ещё не открывал (стейдж = primary_contact).
  demoOpenedAt: timestamp("demo_opened_at"),
  // Последняя активность кандидата (ответ в демо / автосохранение теста /
  // открытие теста) — для фильтра «активны сейчас» (isActive ≤ 30 мин).
  lastActivityAt: timestamp("last_activity_at"),
  autoProcessingStopped: boolean("auto_processing_stopped").notNull().default(false),
  autoProcessingStoppedReason: text("auto_processing_stopped_reason"),
  autoProcessingStoppedAt: timestamp("auto_processing_stopped_at", { withTimezone: true }),
  // Отложенный отказ (drizzle/0155). Никаких мгновенных авто-отказов: точки
  // отказа ставят pendingRejectionAt = триггер + задержка вакансии, cron
  // /api/cron/pending-rejections исполняет в рабочее время. NULL = не запланирован.
  pendingRejectionAt:     timestamp("pending_rejection_at", { withTimezone: true }),
  pendingRejectionReason: text("pending_rejection_reason"),
  pendingRejectionSetAt:  timestamp("pending_rejection_set_at", { withTimezone: true }),
  // Отрендеренный текст отказа на момент планирования (Заход 3). NULL =
  // использовать generic rejectMessage вакансии. Нужен для факторных текстов
  // стоп-факторов, которые иначе потерялись бы при отложенном отказе.
  pendingRejectionMessage: text("pending_rejection_message"),
  // Структурированная причина отказа (захват на карточке, разбивка в отчёте найма).
  // Таксономия — lib/hr/rejection-reasons.ts. initiator: 'company'|'candidate'.
  rejectionReasonCategory: text("rejection_reason_category"),
  rejectionInitiator:      text("rejection_initiator"),
  rejectionComment:        text("rejection_comment"),
  rejectionAt:             timestamp("rejection_at", { withTimezone: true }),
  // Аудит 10.07: дата события НАЙМА (миграция 0274) — по ней отчёт считает
  // «Нанято за период» (раньше даты найма не было вовсе, отчёт считал по
  // дате отклика). Пишется в ручном stage-роуте и funnel-v2.
  hiredAt:                 timestamp("hired_at", { withTimezone: true }),
  // v5: AI-классификатор ответов в hh-чате может выставить паузу автоматизации
  // (например, при rejection или wants_personal_contact).
  automationPaused: boolean("automation_paused").notNull().default(false),
  // Сколько раз scan-incoming уже отправил кандидату эскалационный
  // шаблон callIntent (vacancy.automation.callIntent.insistDemoMessages).
  // После 3 — больше не реагируем на keywords. См. Сессия 5.
  callIntentCount:  integer("call_intent_count").notNull().default(0),
  // Предквалификация (Сессия 6b/9). status: pending|passed|failed|no_answer
  // или NULL если предкв не запускалась. sent_at — момент отправки вопросов,
  // completed_at — момент финального решения.
  prequalificationStatus:        text("prequalification_status"),
  prequalificationSentAt:        timestamp("prequalification_sent_at", { withTimezone: true }),
  prequalificationCompletedAt:   timestamp("prequalification_completed_at", { withTimezone: true }),
  // v5: дубль по реферальной ссылке — какой short_id привёл этого кандидата.
  referredByShortId: text("referred_by_short_id"),
  // Альтернативные токены при дедупликации: один человек может зайти по
  // разным реф-ссылкам, мы оставляем одну карточку и копим сюда исходные
  // токены (см. lib/candidates/normalize-contacts.ts + apply route).
  referralUuids: jsonb("referral_uuids").$type<string[]>().notNull().default([]),
  // Группа 30: счётчик медиум-уровней грубости в AI-чате. На 2-м срабатывании
  // — автоотказ. Сбрасывается только новой ручной активацией HR-ом (или при
  // пересоздании кандидата). См. drizzle/0134_ai_chatbot_v2_tracking.sql.
  abuseWarningsCount:   integer("abuse_warnings_count").notNull().default(0),
  lastAbuseWarningAt:   timestamp("last_abuse_warning_at", { withTimezone: true }),
  // Группа 33: счётчик «коротких» сообщений ("Минутку, посмотрю...") за
  // диалог. Лимит регулируется в aiChatbotSettings.responseTiming.
  // См. drizzle/0135_chatbot_delays.sql.
  shortMessagesSentCount: integer("short_messages_sent_count").notNull().default(0),
  lastShortMessageAt:     timestamp("last_short_message_at", { withTimezone: true }),
  // drizzle/0158 — для будущего Telegram-канала чат-бота (связка с чатом кандидата)
  telegramChatId:   text("telegram_chat_id"),
  telegramUsername: text("telegram_username"),
  // drizzle/0198 — F7: Telegram-бот для переписки с кандидатами
  // Случайный UUID-токен для deep-link: t.me/<bot>?start=<token>
  telegramInviteToken: text("telegram_invite_token"),
  // Кандидат отписался командой /stop — больше не пишем
  telegramOptOut:   boolean("telegram_opt_out").notNull().default(false),
  // История сообщений TG-переписки: [{role:'hr'|'candidate', text, sentAt}]
  tgMessages:       jsonb("tg_messages").$type<TgMessage[]>().notNull().default([]),
  // drizzle/0162 — мягкое удаление («Корзина»). NOT NULL = в корзине, скрыт из
  // списков/счётчиков; восстановление или удаление навсегда; авто-очистка по
  // companies.trash_retention_days.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // drizzle/0226 — Фаза 0 рантайма воронки v2. NULL = кандидат в легаси-пути,
  // не вошёл в v2-воронку. Структура — FunnelV2State (объявлен выше в этом файле).
  funnelV2StateJson: jsonb("funnel_v2_state_json").$type<FunnelV2State | null>(),
  // drizzle/0247 — ФЗ-152: момент обезличивания ПДн отказанного кандидата по
  // истечении срока хранения компании. NOT NULL = персональные данные вычищены
  // (имя→«Удалён», контакты/резюме/анкеты/фото очищены), крон не трогает повторно.
  personalDataErasedAt: timestamp("personal_data_erased_at", { withTimezone: true }),
  // drizzle/0258 — Скоркарта интервью. interview_score = manualOverride ??
  // autoScore из interview_scorecard_json (см. lib/candidates/interview-scorecard.ts).
  // NULL = интервью ещё не оценивалось. Критерии — из Портрета (mustHave×2 +
  // niceToHave×1) + 3 универсальных («Коммуникация», «Мотивация», «Взял бы в команду»).
  interviewScore:       integer("interview_score"),
  interviewScorecardJson: jsonb("interview_scorecard_json").$type<InterviewScorecard | null>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Контакты с кандидатом (звонки/видео/встречи) с исходом — захват на карточке,
// счётчики в отчёте найма. channel/outcome — lib/hr/contacts.ts; reasonCategory
// (для outcome=no_fit) — lib/hr/rejection-reasons.ts.
export const candidateContacts = pgTable("candidate_contacts", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  candidateId:    uuid("candidate_id").references(() => candidates.id, { onDelete: "cascade" }).notNull(),
  vacancyId:      uuid("vacancy_id"),                         // денорм. для группировки в отчёте
  channel:        text("channel").default("call"),            // call|video|meeting|message
  outcome:        text("outcome").default("pending"),         // fit|no_fit|pending
  reasonCategory: text("reason_category"),                    // при no_fit — из rejection-reasons
  comment:        text("comment"),
  createdById:    uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("candidate_contacts_candidate_idx").on(t.candidateId),
  index("candidate_contacts_tenant_idx").on(t.tenantId),
])

// ─── Adaptation ───────────────────────────────────────────────────────────────

export const adaptationPlans = pgTable("adaptation_plans", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  positionId:  text("position_id"),
  durationDays:integer("duration_days").default(14),
  planType:    text("plan_type").default("onboarding"), // 'onboarding'|'preboarding'|'reboarding'
  isTemplate:  boolean("is_template").default(false),
  isActive:    boolean("is_active").default(true),
  createdBy:   uuid("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const adaptationSteps = pgTable("adaptation_steps", {
  id:             uuid("id").primaryKey().defaultRandom(),
  planId:         uuid("plan_id").references(() => adaptationPlans.id, { onDelete: "cascade" }).notNull(),
  dayNumber:      integer("day_number").notNull(),
  sortOrder:      integer("sort_order").default(0),
  title:          text("title").notNull(),
  type:           text("type").default("lesson"), // 'lesson'|'task'|'quiz'|'video'|'checklist'|'meeting'
  content:        jsonb("content"),
  channel:        text("channel").default("auto"),
  durationMin:    integer("duration_min"),
  isRequired:     boolean("is_required").default(true),
  // D1: Adaptive tracks
  conditions:     jsonb("conditions"),            // { roles?, departments?, minScore? }
  // D4: UGC
  createdByRole:  text("created_by_role").default("hr"), // 'hr'|'buddy'|'employee'
  isApproved:     boolean("is_approved").default(true),
  approvedBy:     uuid("approved_by").references(() => users.id),
  approvedAt:     timestamp("approved_at"),
})

export const adaptationAssignments = pgTable("adaptation_assignments", {
  id:               uuid("id").primaryKey().defaultRandom(),
  planId:           uuid("plan_id").references(() => adaptationPlans.id, { onDelete: "cascade" }).notNull(),
  employeeId:       uuid("employee_id"),
  buddyId:          uuid("buddy_id"),
  startDate:        timestamp("start_date"),
  status:           text("status").default("active"), // 'active'|'paused'|'cancelled'|'completed'
  currentDay:       integer("current_day").default(1),
  completionPct:    integer("completion_pct").default(0),
  totalSteps:       integer("total_steps"),
  completedSteps:   integer("completed_steps").default(0),
  avgResponseTime:  integer("avg_response_time"),
  completedAt:      timestamp("completed_at"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
})

export const stepCompletions = pgTable("step_completions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  stepId:       uuid("step_id").references(() => adaptationSteps.id, { onDelete: "cascade" }).notNull(),
  status:       text("status").default("pending"), // 'pending'|'sent'|'viewed'|'completed'|'skipped'
  sentAt:       timestamp("sent_at"),
  viewedAt:     timestamp("viewed_at"),
  completedAt:  timestamp("completed_at"),
  answer:       jsonb("answer"),
  score:        integer("score"),
  feedback:     text("feedback"),
}, (t) => [unique().on(t.assignmentId, t.stepId)])

// ─── Buddy-система ────────────────────────────────────────────────────────────

export const buddyChecklists = pgTable("buddy_checklists", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:     text("title").notNull(),
  items:     jsonb("items").notNull().default("[]"), // { id, text, order }[]
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
})

export const buddyTasks = pgTable("buddy_tasks", {
  id:              uuid("id").primaryKey().defaultRandom(),
  assignmentId:    uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  checklistItemId: text("checklist_item_id"),
  title:           text("title").notNull(),
  description:     text("description"),
  dayNumber:       integer("day_number"),
  status:          text("status").default("pending"), // 'pending'|'done'|'skipped'
  completedAt:     timestamp("completed_at"),
  note:            text("note"),
  createdAt:       timestamp("created_at").defaultNow(),
})

export const buddyMeetings = pgTable("buddy_meetings", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  scheduledAt:  timestamp("scheduled_at"),
  completedAt:  timestamp("completed_at"),
  status:       text("status").default("scheduled"), // 'scheduled'|'completed'|'cancelled'|'rescheduled'
  notes:        text("notes"),
  rating:       integer("rating"),   // 1-5
  feedback:     text("feedback"),
  createdAt:    timestamp("created_at").defaultNow(),
})

// ─── Gamification ─────────────────────────────────────────────────────────────

export const employeePoints = pgTable("employee_points", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:     text("employee_id").notNull(),
  totalPoints:    integer("total_points").default(0),
  level:          integer("level").default(1),
  streak:         integer("streak").default(0),
  lastActiveDate: timestamp("last_active_date"),
}, (t) => [unique().on(t.tenantId, t.employeeId)])

export const pointsHistory = pgTable("points_history", {
  id:         uuid("id").primaryKey().defaultRandom(),
  pointsId:   uuid("points_id").references(() => employeePoints.id, { onDelete: "cascade" }).notNull(),
  amount:     integer("amount").notNull(),
  reason:     text("reason").notNull(),
  sourceType: text("source_type"),
  sourceId:   text("source_id"),
  createdAt:  timestamp("created_at").defaultNow(),
})

export const badges = pgTable("badges", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  icon:        text("icon").notNull(),
  condition:   jsonb("condition"),
  points:      integer("points").default(0),
})

export const employeeBadges = pgTable("employee_badges", {
  id:       uuid("id").primaryKey().defaultRandom(),
  pointsId: uuid("points_id").references(() => employeePoints.id, { onDelete: "cascade" }).notNull(),
  badgeId:  uuid("badge_id").references(() => badges.id, { onDelete: "cascade" }).notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (t) => [unique().on(t.pointsId, t.badgeId)])

// ─── Tenant Modules ───────────────────────────────────────────────────────────

export const tenantModules = pgTable("tenant_modules", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  moduleId:      uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  isActive:      boolean("is_active").default(true),
  activatedAt:   timestamp("activated_at"),
  expiresAt:     timestamp("expires_at"),
  maxVacancies:  integer("max_vacancies"),   // null = безлимит
  maxCandidates: integer("max_candidates"),
  maxEmployees:  integer("max_employees"),
  maxScenarios:  integer("max_scenarios"),
  maxUsers:      integer("max_users"),
  customLimits:  jsonb("custom_limits"),
  enabledAt:     timestamp("enabled_at", { withTimezone: true }),
  disabledAt:    timestamp("disabled_at", { withTimezone: true }),
  // Биллинг-поля (миграция 0217): цена модуля на момент назначения,
  // применённая скидка за набор, количество (зарезервировано для SaaS-unit).
  priceKopecks:           integer("price_kopecks"),            // null = не задана
  appliedDiscountPercent: integer("applied_discount_percent").notNull().default(0),
  quantity:               integer("quantity").notNull().default(1),
}, (t) => [unique().on(t.tenantId, t.moduleId)])

// ─── LMS — Курсы ──────────────────────────────────────────────────────────────

export const courses = pgTable("courses", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  description:  text("description"),
  coverImage:   text("cover_image"),
  category:     text("category").default("custom"), // 'sales'|'product'|'soft_skills'|'compliance'|'custom'
  difficulty:   text("difficulty").default("beginner"), // 'beginner'|'intermediate'|'advanced'
  durationMin:  integer("duration_min"),
  isPublished:  boolean("is_published").default(false),
  isRequired:   boolean("is_required").default(false),
  requiredFor:  jsonb("required_for"),  // { roles?, departments? }
  sortOrder:    integer("sort_order").default(0),
  // Порог сдачи итогового теста (0-100), % от суммы баллов квиз-уроков.
  // null = проверка по баллам отключена (курс завершается по факту прохождения
  // всех уроков, как раньше — legacy-курсы без порога не ломаются).
  // Миграция 0257.
  passingScorePercent: integer("passing_score_percent"),
  createdBy:    uuid("created_by").references(() => users.id),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

export const lessons = pgTable("lessons", {
  id:          uuid("id").primaryKey().defaultRandom(),
  courseId:    uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  sortOrder:   integer("sort_order").default(0),
  type:        text("type").default("content"), // 'content'|'video'|'quiz'|'assignment'
  content:     jsonb("content"),
  durationMin: integer("duration_min"),
  isRequired:  boolean("is_required").default(true),
})

export const courseEnrollments = pgTable("course_enrollments", {
  id:           uuid("id").primaryKey().defaultRandom(),
  courseId:     uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  employeeId:   text("employee_id").notNull(),
  status:       text("status").default("enrolled"), // 'enrolled'|'in_progress'|'completed'|'dropped'|'failed'
  completionPct:integer("completion_pct").default(0),
  // Средний % по quiz-урокам (среднее lessonCompletions.score по урокам type='quiz'
  // этого курса), null пока ни один квиз не пройден. Используется для гейта
  // courses.passingScorePercent — заполняется при пересчёте completionPct.
  // Миграция 0257.
  quizScorePercent: integer("quiz_score_percent"),
  enrolledAt:   timestamp("enrolled_at").defaultNow(),
  startedAt:    timestamp("started_at"),
  completedAt:  timestamp("completed_at"),
  lastAccessAt: timestamp("last_access_at"),
}, (t) => [unique().on(t.courseId, t.employeeId)])

export const lessonCompletions = pgTable("lesson_completions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").references(() => courseEnrollments.id, { onDelete: "cascade" }).notNull(),
  lessonId:     uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }).notNull(),
  status:       text("status").default("not_started"), // 'not_started'|'in_progress'|'completed'
  score:        integer("score"),
  answer:       jsonb("answer"),
  completedAt:  timestamp("completed_at"),
  timeSpentSec: integer("time_spent_sec"),
}, (t) => [unique().on(t.enrollmentId, t.lessonId)])

export const certificates = pgTable("certificates", {
  id:         uuid("id").primaryKey().defaultRandom(),
  courseId:   uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  employeeId: text("employee_id").notNull(),
  number:     text("number").unique().notNull(), // MK-2026-XXXXX
  issuedAt:   timestamp("issued_at").defaultNow(),
  validUntil: timestamp("valid_until"),
  pdfUrl:     text("pdf_url"),
})

// ─── Skills & Assessments ─────────────────────────────────────────────────────

export const skills = pgTable("skills", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }), // null = системный
  name:        text("name").notNull(),
  category:    text("category").notNull().default("soft"), // hard/soft/tool/domain
  description: text("description"),
})

export const positionSkills = pgTable("position_skills", {
  id:            uuid("id").primaryKey().defaultRandom(),
  positionId:    text("position_id").notNull(), // текст — без FK, позиция задаётся произвольно
  skillId:       uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  requiredLevel: integer("required_level").notNull().default(3), // 1-5
}, (t) => [unique().on(t.positionId, t.skillId)])

export const assessments = pgTable("assessments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  type:        text("type").notNull().default("self"), // self/manager/peer/360
  status:      text("status").notNull().default("draft"), // draft/in_progress/completed
  period:      text("period"), // e.g. "2026-Q1"
  createdBy:   uuid("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
})

export const skillAssessments = pgTable("skill_assessments", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "cascade" }).notNull(),
  skillId:      uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  score:        integer("score"),  // 1-5
  comment:      text("comment"),
  assessorId:   text("assessor_id"),
})

export const assessmentReviewers = pgTable("assessment_reviewers", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "cascade" }).notNull(),
  reviewerId:   text("reviewer_id").notNull(),
  role:         text("role").notNull().default("peer"), // self/manager/peer/subordinate
  status:       text("status").notNull().default("pending"), // pending/completed/declined
  completedAt:  timestamp("completed_at"),
})

// ─── Блок G: Пульс-опросы ───────────────────────────────────────────────────

export const pulseQuestions = pgTable("pulse_questions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),  // null = системный
  text:       text("text").notNull(),
  category:   text("category").default("engagement"), // engagement/satisfaction/management/culture/workload/growth/communication/wellbeing/team
  isSystem:   boolean("is_system").default(false),
  isActive:   boolean("is_active").default(true),
  sortOrder:  integer("sort_order").default(0),
})

export const pulseSurveys = pgTable("pulse_surveys", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title"),
  scheduledAt:  timestamp("scheduled_at"),
  sentAt:       timestamp("sent_at"),
  closesAt:     timestamp("closes_at"),
  status:       text("status").default("draft"),    // draft/scheduled/sent/closed
  channel:      text("channel").default("telegram"), // telegram/whatsapp/email/web
  questionIds:  jsonb("question_ids"),               // uuid[] — 2 вопроса + открытый
  responseCount:integer("response_count").default(0),
  createdAt:    timestamp("created_at").defaultNow(),
})

export const pulseResponses = pgTable("pulse_responses", {
  id:          uuid("id").primaryKey().defaultRandom(),
  surveyId:    uuid("survey_id").references(() => pulseSurveys.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  questionId:  uuid("question_id").references(() => pulseQuestions.id).notNull(),
  score:       integer("score"),          // 1-5 (шкала настроения)
  openText:    text("open_text"),         // ответ на открытый вопрос
  isAnonymous: boolean("is_anonymous").default(true),
  respondedAt: timestamp("responded_at").defaultNow(),
}, (t) => [unique().on(t.surveyId, t.employeeId, t.questionId)])

// ─── Блок G: Flight Risk ────────────────────────────────────────────────────

export const flightRiskScores = pgTable("flight_risk_scores", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:    text("employee_id").notNull(),
  employeeName:  text("employee_name"),
  department:    text("department"),
  position:      text("position"),
  score:         integer("score").notNull().default(0),  // 0-100
  riskLevel:     text("risk_level").default("low"),       // low/medium/high/critical
  factors:       jsonb("factors"),                         // { factorSlug: number }[]
  previousScore: integer("previous_score"),
  trend:         text("trend").default("stable"),          // improving/stable/declining
  calculatedAt:  timestamp("calculated_at").defaultNow(),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.tenantId, t.employeeId)])

export const flightRiskFactors = pgTable("flight_risk_factors", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  category:    text("category").notNull(), // tenure/engagement/pulse/performance/organizational/compensation/development
  weight:      integer("weight").default(1),  // вес фактора (1-10)
  description: text("description"),
  isActive:    boolean("is_active").default(true),
})

export const retentionActions = pgTable("retention_actions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  type:        text("type").default("conversation"), // conversation/compensation/development/role_change/team_change/other
  status:      text("status").default("planned"),     // planned/in_progress/completed/cancelled
  priority:    text("priority").default("medium"),     // low/medium/high/urgent
  assignedTo:  uuid("assigned_to").references(() => users.id),
  dueDate:     timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  outcome:     text("outcome"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Блок H: Offboarding ────────────────────────────────────────────────────

export const offboardingCases = pgTable("offboarding_cases", {
  id:              uuid("id").primaryKey().defaultRandom(),
  tenantId:        uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:      text("employee_id").notNull(),
  employeeName:    text("employee_name"),
  department:      text("department"),
  position:        text("position"),
  reason:          text("reason").default("voluntary"),  // voluntary/involuntary/retirement/contract_end/mutual
  lastWorkDay:     timestamp("last_work_day"),
  status:          text("status").default("initiated"),  // initiated/in_progress/exit_interview/completed/cancelled
  checklistJson:   jsonb("checklist_json"),               // { id, title, done, assignedTo }[]
  referralBridge:  boolean("referral_bridge").default(false), // оставить как реферала?
  rehireEligible:  boolean("rehire_eligible").default(true),
  notes:           text("notes"),
  createdBy:       uuid("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
})

export const exitSurveys = pgTable("exit_surveys", {
  id:            uuid("id").primaryKey().defaultRandom(),
  caseId:        uuid("case_id").references(() => offboardingCases.id, { onDelete: "cascade" }).notNull(),
  channel:       text("channel").default("web"),  // web/telegram/email
  status:        text("status").default("pending"), // pending/sent/completed
  sentAt:        timestamp("sent_at"),
  completedAt:   timestamp("completed_at"),
  responses:     jsonb("responses"),  // { questionId: string, question: string, answer: string | number }[]
  overallScore:  integer("overall_score"),  // 1-10 общая оценка опыта
  wouldReturn:   boolean("would_return"),
  wouldRecommend:boolean("would_recommend"),
  openFeedback:  text("open_feedback"),
  isAnonymous:   boolean("is_anonymous").default(false),
  createdAt:     timestamp("created_at").defaultNow(),
})

// ─── Блок I: Reskilling Center ──────────────────────────────────────────────

export const reskillingAssessments = pgTable("reskilling_assessments", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenantId:          uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  position:          text("position").notNull(),
  department:        text("department"),
  automationRisk:    integer("automation_risk").default(0),    // 0-100%
  riskLevel:         text("risk_level").default("low"),        // low/medium/high/critical
  aiImpactSummary:   text("ai_impact_summary"),                // описание влияния AI
  tasksAtRisk:       jsonb("tasks_at_risk"),                    // { task, riskPct, alternative }[]
  recommendedSkills: jsonb("recommended_skills"),               // { skillName, priority, courseId? }[]
  calculatedAt:      timestamp("calculated_at").defaultNow(),
  createdAt:         timestamp("created_at").defaultNow(),
})

export const reskillingPlans = pgTable("reskilling_plans", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:     text("employee_id").notNull(),
  employeeName:   text("employee_name"),
  currentPosition:text("current_position"),
  targetPosition: text("target_position"),
  status:         text("status").default("draft"),    // draft/active/completed/cancelled
  progress:       integer("progress").default(0),      // 0-100
  skills:         jsonb("skills"),                      // { skillId, name, currentLevel, targetLevel, courseId? }[]
  dueDate:        timestamp("due_date"),
  completedAt:    timestamp("completed_at"),
  createdBy:      uuid("created_by").references(() => users.id),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Блок I: Predictive Hiring ──────────────────────────────────────────────

export const predictiveHiringAlerts = pgTable("predictive_hiring_alerts", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  flightRiskId:   uuid("flight_risk_id").references(() => flightRiskScores.id),
  employeeId:     text("employee_id").notNull(),
  employeeName:   text("employee_name"),
  position:       text("position"),
  department:     text("department"),
  riskScore:      integer("risk_score"),
  status:         text("status").default("new"),       // new/vacancy_created/talent_pool_matched/resolved/dismissed
  vacancyId:      uuid("vacancy_id").references(() => vacancies.id),  // auto-created draft
  talentPoolMatch:jsonb("talent_pool_match"),           // matched candidates from pool
  createdAt:      timestamp("created_at").defaultNow(),
  resolvedAt:     timestamp("resolved_at"),
})

// ─── Блок J: Маркетплейс навыков ────────────────────────────────────────────

export const internalProjects = pgTable("internal_projects", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:         text("title").notNull(),
  description:   text("description"),
  department:    text("department"),
  requiredSkills:jsonb("required_skills"),       // { skillName, minLevel }[]
  status:        text("status").default("open"), // open/in_progress/completed/cancelled
  maxParticipants:integer("max_participants").default(5),
  startDate:     timestamp("start_date"),
  endDate:       timestamp("end_date"),
  createdBy:     uuid("created_by").references(() => users.id),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
})

export const projectApplications = pgTable("project_applications", {
  id:           uuid("id").primaryKey().defaultRandom(),
  projectId:    uuid("project_id").references(() => internalProjects.id, { onDelete: "cascade" }).notNull(),
  employeeId:   text("employee_id").notNull(),
  employeeName: text("employee_name"),
  department:   text("department"),
  motivation:   text("motivation"),
  matchScore:   integer("match_score"),           // 0-100 auto-calculated
  status:       text("status").default("pending"), // pending/accepted/rejected/withdrawn
  appliedAt:    timestamp("applied_at").defaultNow(),
  resolvedAt:   timestamp("resolved_at"),
}, (t) => [unique().on(t.projectId, t.employeeId)])

// ─── Блок J: AI-суперагент чат ──────────────────────────────────────────────

export const aiChatMessages = pgTable("ai_chat_messages", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id).notNull(),
  role:       text("role").notNull(),              // user/assistant
  content:    text("content").notNull(),
  sessionId:  text("session_id"),                  // группировка по сессиям
  metadata:   jsonb("metadata"),                   // { tokensUsed, model, tools? }
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Уведомления (реальные, из БД) ─────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id),  // null = для всех HR в тенанте
  type:       text("type").notNull(),                       // pulse_alert/flight_risk_alert/system/info
  title:      text("title").notNull(),
  body:       text("body"),
  severity:   text("severity").default("info"),             // info/warning/danger/success
  sourceType: text("source_type"),                          // pulse_response/flight_risk/retention_action
  sourceId:   text("source_id"),
  href:       text("href"),                                 // ссылка для перехода
  isRead:     boolean("is_read").default(false),
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Held Messages (страж исходящих, Option 2) ────────────────────────────────
// Придержанные на проверку HR сообщения (миграция 0231). Когда у компании включён
// messageGuardHold.enabled и страж нашёл серьёзную проблему — сообщение не уходит,
// кладётся сюда, HR уведомляется и решает: отправить вручную / отклонить.
export const heldMessages = pgTable("held_messages", {
  id:           uuid("id").primaryKey().defaultRandom(),
  companyId:    uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  hhResponseId: text("hh_response_id"),
  candidateId:  uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  messageText:  text("message_text").notNull(),
  issues:       jsonb("issues").$type<string[]>().notNull().default([]),
  source:       text("source"),
  status:       text("status").notNull().default("held"), // held | sent | dismissed
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  resolvedAt:   timestamp("resolved_at"),
})

// ─── Audit Log (ФЗ-152) ───────────────────────────────────────────────────────
// Журнал операций с персональными данными кандидатов (доступ/экспорт/удаление).
export const auditLog = pgTable("audit_log", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  userId:     uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail:  text("user_email"),
  action:     text("action").notNull(),     // candidate_export | candidate_delete | candidate_view_contacts
  entityType: text("entity_type"),           // candidate | vacancy
  entityId:   text("entity_id"),
  count:      integer("count"),
  meta:       jsonb("meta").$type<Record<string, unknown>>().default({}),
  ip:         text("ip"),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

// ─── Invite Links ─────────────────────────────────────────────────────────────

export const inviteLinks = pgTable("invite_links", {
  id:         uuid("id").primaryKey().defaultRandom(),
  companyId:  uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  createdBy:  uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  token:      text("token").unique().notNull(),
  role:       text("role").notNull(),           // director|hr_lead|hr_manager|department_head|observer
  label:      text("label"),                    // необязательное описание (напр. «Для Ани»)
  maxUses:    integer("max_uses").default(1),   // null = безлимит
  usesCount:  integer("uses_count").default(0),
  isActive:   boolean("is_active").default(true),
  expiresAt:  timestamp("expires_at"),          // null = бессрочно
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Notification Preferences ────────────────────────────────────────────────

export const notificationPreferences = pgTable("notification_preferences", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  module:           text("module").notNull(),   // hr, marketing, sales, logistics, general
  category:         text("category").notNull(), // hiring, adaptation, pulse, flight_risk, courses, etc.
  channelEmail:     boolean("channel_email").default(true),
  channelTelegram:  boolean("channel_telegram").default(false),
  channelPush:      boolean("channel_push").default(false),
  channelWeb:       boolean("channel_web").default(true),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.userId, t.module, t.category)])

// ─── Integrators ──────────────────────────────────────────────────────────────

export const integratorLevels = pgTable("integrator_levels", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             text("name").notNull(),
  // 'partner' (для kind in 'partner'|'sub_partner') | 'referral' (для kind='referral').
  audience:         text("audience").notNull().default("partner"),
  minClients:       integer("min_clients").default(0),
  minMrrKopecks:    integer("min_mrr_kopecks").default(0),
  commissionPercent:text("commission_percent").notNull(), // numeric as text
  sortOrder:        integer("sort_order").default(0),
  isActive:         boolean("is_active").default(true),
  createdAt:        timestamp("created_at").defaultNow(),
})

export const integrators = pgTable("integrators", {
  id:           uuid("id").primaryKey().defaultRandom(),
  companyId:    uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).unique().notNull(),
  levelId:      uuid("level_id").references(() => integratorLevels.id),
  // 'partner' | 'sub_partner' | 'referral' — тип партнёра.
  kind:         text("kind").notNull().default("partner"),
  // Старший партнёр для суб-партнёра (двухуровневая иерархия). NULL у обычного партнёра.
  parentIntegratorId: uuid("parent_integrator_id"),
  // Фикс-% именно этого партнёра (override уровня). NULL → берём из integratorLevels.
  commissionPercent:  text("commission_percent"),
  // 'platform' (мы биллим клиента, партнёру начисляем %) | 'partner' (партнёр сам биллит).
  billingMode:  text("billing_mode").notNull().default("platform"),
  contactName:  text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Внешний человекочитаемый номер/реф-код партнёра (напр. "1101"). NULL у старых.
  externalId:   text("external_id"),
  status:       text("status").default("active"), // active, suspended, terminated
  joinedAt:     timestamp("joined_at").defaultNow(),
  createdAt:    timestamp("created_at").defaultNow(),
})

export const integratorClients = pgTable("integrator_clients", {
  id:              uuid("id").primaryKey().defaultRandom(),
  integratorId:    uuid("integrator_id").references(() => integrators.id, { onDelete: "cascade" }).notNull(),
  clientCompanyId: uuid("client_company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  // Кто из пользователей партнёра завёл клиента (для аудита).
  onboardedByUserId: uuid("onboarded_by_user_id"),
  // 'onboarding' | 'active' | 'cancelled'
  status:          text("status").notNull().default("active"),
  referredAt:      timestamp("referred_at").defaultNow(),
}, (t) => [unique().on(t.integratorId, t.clientCompanyId)])

export const integratorPayouts = pgTable("integrator_payouts", {
  id:               uuid("id").primaryKey().defaultRandom(),
  integratorId:     uuid("integrator_id").references(() => integrators.id, { onDelete: "cascade" }).notNull(),
  periodStart:      timestamp("period_start").notNull(),
  periodEnd:        timestamp("period_end").notNull(),
  totalMrrKopecks:  integer("total_mrr_kopecks").default(0),
  commissionPercent:text("commission_percent"),
  payoutKopecks:    integer("payout_kopecks").default(0),
  status:           text("status").default("pending"), // pending, approved, paid
  paidAt:           timestamp("paid_at"),
  createdAt:        timestamp("created_at").defaultNow(),
})

// ─── Calendar & Rooms ─────────────────────────────────────────────────────────

export const rooms = pgTable("rooms", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  name:      text("name").notNull(),
  capacity:  integer("capacity"),
  equipment: text("equipment").array(),
  floor:     text("floor"),
  isActive:  boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
})

export const calendarEvents = pgTable("calendar_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").references(() => companies.id).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  type:        text("type").notNull().default("meeting"), // meeting|interview|training|booking|other
  startAt:     timestamp("start_at", { withTimezone: true }).notNull(),
  endAt:       timestamp("end_at", { withTimezone: true }).notNull(),
  allDay:      boolean("all_day").default(false),
  roomId:      uuid("room_id").references(() => rooms.id),
  createdBy:   uuid("created_by").references(() => users.id).notNull(),
  color:       text("color"),
  recurrence:  text("recurrence"),
  status:      text("status").default("confirmed"), // confirmed|tentative|cancelled
  // C6: метки отправленных напоминаний (24ч/2ч до start_at). NULL = не слали.
  remind24hSentAt: timestamp("remind_24h_sent_at", { withTimezone: true }),
  remind2hSentAt:  timestamp("remind_2h_sent_at", { withTimezone: true }),
  // #27: доп. напоминания — «утром в день встречи» и «за час до». NULL = не слали.
  remindMorningSentAt: timestamp("remind_morning_sent_at", { withTimezone: true }),
  remind1hSentAt:      timestamp("remind_1h_sent_at", { withTimezone: true }),
  // Юрий 09.07: 4-й порог кандидату/HR-каналу — «за 15 минут» (миграция 0271).
  remind15mSentAt:     timestamp("remind_15m_sent_at", { withTimezone: true }),
  // Напоминания МЕНЕДЖЕРУ (создателю события) в Telegram-бот @Ren_HR_bot —
  // отдельная дорожка от напоминаний кандидату/HR-каналу выше (миграция 0270),
  // своя идемпотентность, включает доп. порог «за 15 минут».
  remindManager24hSentAt:     timestamp("remind_manager_24h_sent_at", { withTimezone: true }),
  remindManagerMorningSentAt: timestamp("remind_manager_morning_sent_at", { withTimezone: true }),
  remindManager1hSentAt:      timestamp("remind_manager_1h_sent_at", { withTimezone: true }),
  remindManager15mSentAt:     timestamp("remind_manager_15m_sent_at", { withTimezone: true }),
  // Интервью-модуль: структура для событий type='interview' (всё nullable).
  candidateId:      uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  vacancyId:        uuid("vacancy_id").references(() => vacancies.id, { onDelete: "set null" }),
  interviewer:      text("interviewer"),
  interviewType:    text("interview_type"),    // Техническое | HR | Финальное
  interviewFormat:  text("interview_format"),   // Онлайн | Офис
  interviewStatus:  text("interview_status"),    // Подтверждено|Ожидает|Пройдено|Не явился|Отменено
  // #14: адрес офиса (для Офис) / ссылка на видео-звонок (для Онлайн)
  location:    text("location"),
  meetingUrl:  text("meeting_url"),
  // Воронка v2 Фаза 2: фиксация исхода собеседования HR-ом (всё nullable).
  interviewOutcome:   text("interview_outcome"),    // held|no_show|rescheduled
  interviewRating:    integer("interview_rating"),  // впечатление 1-5
  interviewDecision:  text("interview_decision"),   // advance|offer|reject|reserve
  interviewNotes:     text("interview_notes"),
  interviewOutcomeAt: timestamp("interview_outcome_at", { withTimezone: true }),
  scope:       text("scope").notNull().default("company"), // company|hr|personal
  // Внешние участники (не из платформы) — имена/email вручную, free-text.
  externalParticipants: jsonb("external_participants").$type<string[]>().default([]),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const calendarEventParticipants = pgTable("calendar_event_participants", {
  id:      uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }).notNull(),
  userId:  uuid("user_id").references(() => users.id).notNull(),
  status:  text("status").default("pending"), // pending|accepted|declined
}, (t) => [unique().on(t.eventId, t.userId)])

// ─── SMS Codes ────────────────────────────────────────────────────────────────

export const smsCodes = pgTable("sms_codes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  phone:     text("phone").notNull(),
  code:      text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used:      boolean("used").default(false),
  attempts:  integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Billing ──────────────────────────────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id:            uuid("id").primaryKey().defaultRandom(),
  companyId:     uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  planId:        uuid("plan_id").references(() => plans.id),
  invoiceNumber: text("invoice_number").notNull(),
  amountKopecks: integer("amount_kopecks"),
  amount:        integer("amount"),
  periodStart:   date("period_start"),
  periodEnd:     date("period_end"),
  status:        text("status").default("pending").notNull(), // 'pending'|'issued'|'paid'|'cancelled'
  buyerName:     text("buyer_name"),
  buyerInn:      text("buyer_inn"),
  buyerKpp:      text("buyer_kpp"),
  issuedAt:      timestamp("issued_at", { withTimezone: true }),
  paidAt:        timestamp("paid_at", { withTimezone: true }),
  dueDate:       date("due_date"),
  paymentMethod: text("payment_method"),
  pdfPath:       text("pdf_path"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const subscriptionHistory = pgTable("subscription_history", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  planId:    uuid("plan_id").references(() => plans.id),
  event:     text("event").notNull(),
  details:   jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Vacancy UTM Links ───────────────────────────────────────────────────────

export const vacancyUtmLinks = pgTable("vacancy_utm_links", {
  id:              uuid("id").primaryKey().defaultRandom(),
  vacancyId:       uuid("vacancy_id").references(() => vacancies.id, { onDelete: "cascade" }).notNull(),
  source:          text("source").notNull(), // 'telegram' | 'whatsapp' | 'vk' | 'email' | 'site' | 'qr' | 'agency' | 'other'
  name:            text("name").notNull(),
  slug:            text("slug").unique().notNull(),
  destinationUrl:  text("destination_url"),
  // Куда ведёт /v/{slug}: 'vacancy' → /vacancy/{slug} (default), 'demo' →
  // /api/public/source/{linkId}/visit (создаёт кандидата и шлёт на /demo).
  // Миграция 0145. Существующие строки → 'vacancy' через default.
  destinationType: text("destination_type").notNull().default("vacancy"),
  clicks:          integer("clicks").default(0),
  candidatesCount: integer("candidates_count").default(0),
  // Audit: кто создал ссылку (миграция 0146). Nullable — старые
  // (доaudit) строки остаются NULL. FK не ставим намеренно: при удалении
  // юзера ссылку сохраняем. Параллельная запись идёт в activity_log
  // (entity_type='utm_link') для полноценного трейла.
  createdByUserId: uuid("created_by_user_id"),
  createdAt:       timestamp("created_at").defaultNow(),
})

export const hhCandidates = pgTable("hh_candidates", {
  id:              uuid("id").primaryKey().defaultRandom(),
  candidateId:     uuid("candidate_id").references(() => candidates.id).notNull(),
  hhResumeId:      text("hh_resume_id").notNull().unique(),
  hhApplicationId: text("hh_application_id"),
  importedAt:      timestamp("imported_at").defaultNow(),
})

// ─── Knowledge Base ─────────────────────────────────────────────────────────

export const knowledgeCategories = pgTable("knowledge_categories", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  slug:        text("slug"),
  description: text("description"),
  icon:        text("icon"),
  sortOrder:   integer("sort_order").default(0),
  parentId:    uuid("parent_id"),
  status:      text("status").default("active"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const knowledgeArticles = pgTable("knowledge_articles", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  categoryId:  uuid("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
  title:       text("title").notNull(),
  slug:        text("slug"),
  content:     text("content"),
  excerpt:     text("excerpt"),
  authorId:    uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  viewsCount:  integer("views_count").default(0),
  isPinned:    boolean("is_pinned").default(false),
  status:      text("status").default("published"), // draft | review | review_changes | published | archived
  reviewerId:  uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  tags:        text("tags").array(),
  audience:    jsonb("audience").default('["employees"]'),
  reviewCycle: text("review_cycle").default("none"),
  validUntil:  timestamp("valid_until"),
  // RAG: embedding vector. Stored as jsonb (float array) пока pgvector не
  // поднят. После CREATE EXTENSION vector мигрировать на vector(1536).
  embedding:   jsonb("embedding"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── AI Course Projects ──────────────────────────────────────────────────────

export const aiCourseProjects = pgTable("ai_course_projects", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenantId:         uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:            text("title").notNull(),
  description:      text("description"),
  status:           text("status").default("draft"),            // draft | generating | ready | published
  sources:          jsonb("sources").default([]),                // [{type, title, content, url?}]
  params:           jsonb("params"),                             // {audience, format, tone, withTests, withSummary}
  result:           jsonb("result"),                             // generated course structure
  publishedCourseId: uuid("published_course_id").references(() => courses.id, { onDelete: "set null" }),
  tokensInput:      integer("tokens_input").default(0),
  tokensOutput:     integer("tokens_output").default(0),
  costUsd:          text("cost_usd").default("0"),              // numeric as text
  createdBy:        uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
})

export const aiUsageLog = pgTable("ai_usage_log", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action:       text("action").notNull(),                       // course_generate | course_regenerate
  projectId:    uuid("project_id").references(() => aiCourseProjects.id, { onDelete: "cascade" }),
  inputTokens:  integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model:        text("model"),
  costUsd:      text("cost_usd").default("0"),
  createdAt:    timestamp("created_at").defaultNow(),
})

// Question logs: для агента аудита пробелов базы знаний
export const knowledgeQuestionLogs = pgTable("knowledge_question_logs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:      uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  question:    text("question").notNull(),
  questionKey: text("question_key"),                      // нормализованный ключ для группировки
  answered:    boolean("answered").default(false),
  source:      text("source").default("web"),             // web | telegram | api
  notified:    boolean("notified").default(false),        // для мгновенных уведомлений 3+
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// Reviews / comments on knowledge articles
export const knowledgeReviews = pgTable("knowledge_reviews", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  articleId:   uuid("article_id").references(() => knowledgeArticles.id, { onDelete: "cascade" }).notNull(),
  authorId:    uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  action:      text("action").notNull(), // comment | approve | request_changes
  comment:     text("comment"),           // текстовый комментарий
  voiceUrl:    text("voice_url"),         // URL голосового сообщения
  videoUrl:    text("video_url"),         // URL видеозаписи с объяснениями
  attachments: text("attachments").array(), // доп. файлы / скриншоты
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Access Requests (заявки на подключение) ─────────────────────────────────

export const accessRequests = pgTable("access_requests", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  phone:       text("phone"),
  companyName: text("company_name"),
  comment:     text("comment"),
  status:      text("status").default("new"),   // new | contacted | approved | rejected
  requestType: text("request_type").default("access"), // access | demo | tariff_change | ...
  newValue:    text("new_value"),
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Task Projects ───────────────────────────────────────────────────────────

export const taskProjects = pgTable("task_projects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  status:      text("status").default("active"),     // planning | active | paused | completed | archived
  color:       text("color").default("#378ADD"),
  icon:        text("icon"),
  deadline:    timestamp("deadline"),
  ownerId:     uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  templateId:  uuid("template_id"),
  progress:    integer("progress").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId:      uuid("project_id").references(() => taskProjects.id, { onDelete: "set null" }),
  parentId:       uuid("parent_id"),                   // self-ref for subtasks
  title:          text("title").notNull(),
  description:    text("description"),
  status:         text("status").default("todo"),      // todo | in_progress | review | done | cancelled
  priority:       text("priority").default("medium"),  // urgent | high | medium | low
  assigneeId:     uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  creatorId:      uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
  source:         text("source").default("manual"),    // manual | ai | crm | hr | knowledge
  sourceId:       uuid("source_id"),
  tags:           text("tags").array(),
  deadline:       timestamp("deadline"),
  startedAt:      timestamp("started_at"),
  completedAt:    timestamp("completed_at"),
  estimatedHours: text("estimated_hours"),             // numeric as text
  actualHours:    text("actual_hours"),
  progress:       integer("progress").default(0),
  sortOrder:      integer("sort_order").default(0),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Task Comments ───────────────────────────────────────────────────────────

export const taskComments = pgTable("task_comments", {
  id:        uuid("id").primaryKey().defaultRandom(),
  taskId:    uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Task Activity Log ───────────────────────────────────────────────────────

export const taskActivityLog = pgTable("task_activity_log", {
  id:        uuid("id").primaryKey().defaultRandom(),
  taskId:    uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action:    text("action").notNull(),               // created | status_changed | assigned | commented | completed | deadline_changed
  oldValue:  text("old_value"),
  newValue:  text("new_value"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Visit Log ───────────────────────────────────────────────────────────────

export const visitLog = pgTable("visit_log", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  tenantId:  uuid("tenant_id"),
  sessionId: text("session_id"),
  page:      text("page").notNull(),
  ip:        text("ip"),
  userAgent: text("user_agent"),
  referrer:  text("referrer"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Custom Skills / Items ───────────────────────────────────────────────────

export const customSkills = pgTable("custom_skills", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:      text("name").notNull(),
  type:      text("type").notNull().default("skill"), // 'skill' | 'condition' | 'stop_factor' | 'parameter'
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.companyId, t.name, t.type)])

// ─── Custom Vacancy Categories ───────────────────────────────────────────────

export const customVacancyCategories = pgTable("custom_vacancy_categories", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.companyId, t.name)])

// ─── User Sessions (online tracking) ────────────────────────────────────────

export const userSessions = pgTable("user_sessions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tenantId:     uuid("tenant_id"),
  startedAt:    timestamp("started_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  lastPage:     text("last_page"),
  ip:           text("ip"),
  userAgent:    text("user_agent"),
  isOnline:     boolean("is_online").default(true),
})

// ─── Demo Templates & Vacancy Demos ──────────────────────────────────────────

export const demoTemplates = pgTable("demo_templates", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  niche:         text("niche").notNull().default("universal"),
  length:        text("length").notNull().default("standard"),
  isSystem:      boolean("is_system").default(false),
  sections:      jsonb("sections").notNull().default("[]"),
  variablesUsed: jsonb("variables_used").default("[]"),
  audience:      jsonb("audience").default('["candidates"]'),
  reviewCycle:   text("review_cycle").default("none"),
  validUntil:    timestamp("valid_until"),
  // RAG: см. knowledgeArticles.embedding
  embedding:     jsonb("embedding"),
  // Этап 3: корзина. NULL — активный; не-NULL — в корзине, cron trash-cleanup
  // удалит навсегда через companies.trash_retention_days. Миграция 0143.
  deletedAt:     timestamp("deleted_at"),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
})

// Шаблоны анкет (библиотека). По образцу demoTemplates: per-tenant, soft-delete,
// системные не удаляются. questions — Question[] (lib/course-types.ts), тот же
// формат, что vacancy.descriptionJson.anketa.questions → применимо к вакансии.
// Миграция 0147.
export const questionnaireTemplates = pgTable("questionnaire_templates", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),
  type:       text("type").notNull().default("candidate"), // candidate | client | post_demo
  questions:  jsonb("questions").notNull().default("[]"),
  isSystem:   boolean("is_system").default(false),
  deletedAt:  timestamp("deleted_at"),
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
})

// ─── Role Templates (ТЗ №2) ──────────────────────────────────────────────────
// Шаблон роли — тонкая обёртка над контентом (анкета + демо + критерии + воронка).
// Системный (is_system=true, tenant_id=null) виден всем тенантам; тенант может
// завести свой. Анкета/демо — ссылками на questionnaire_templates/demo_templates;
// критерии (CandidateSpec) и стадии Воронки v2 — inline jsonb (отд. таблиц нет).
// Применение к вакансии (подстановка профиля продукта) — ТЗ №3. Миграция 0225.
export const roleTemplates = pgTable("role_templates", {
  id:                      uuid("id").primaryKey().defaultRandom(),
  slug:                    text("slug").unique(),              // 'sales-manager-b2b'
  name:                    text("name").notNull(),
  description:             text("description"),
  roleCategory:            text("role_category"),              // 'sales' | 'marketing' | ...
  isSystem:                boolean("is_system").default(false),
  tenantId:                uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  questionnaireTemplateId: uuid("questionnaire_template_id").references(() => questionnaireTemplates.id, { onDelete: "set null" }),
  demoTemplateId:          uuid("demo_template_id").references(() => demoTemplates.id, { onDelete: "set null" }),
  specTemplate:            jsonb("spec_template").$type<Partial<CandidateSpec>>().notNull().default({}),
  funnelV2Template:        jsonb("funnel_v2_template").$type<FunnelV2Stage[]>().notNull().default([]),
  scoringFormula:          jsonb("scoring_formula").$type<RoleScoringFormula>().notNull().default({}),
  isPublished:             boolean("is_published").default(false),
  deletedAt:               timestamp("deleted_at"),
  createdAt:               timestamp("created_at").defaultNow(),
  updatedAt:               timestamp("updated_at").defaultNow(),
  createdBy:               uuid("created_by").references(() => users.id, { onDelete: "set null" }),
})

// ─── Training: AI ролевые сценарии ───────────────────────────────────────────

export const trainingScenarios = pgTable("training_scenarios", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  description:  text("description"),
  type:         text("type").notNull(),           // cold_call | inbound_support | interview | custom
  difficulty:   text("difficulty").default("medium"), // easy | medium | hard
  systemPrompt: text("system_prompt").notNull(),  // роль AI в сценарии
  criteria:     jsonb("criteria").default("[]"),  // массив критериев оценки
  relatedArticleId: uuid("related_article_id").references(() => knowledgeArticles.id, { onDelete: "set null" }),
  isPreset:     boolean("is_preset").default(false), // встроенные сценарии
  createdBy:    uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

export const trainingSessions = pgTable("training_sessions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  scenarioId:   uuid("scenario_id").references(() => trainingScenarios.id, { onDelete: "cascade" }).notNull(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  messages:     jsonb("messages").notNull().default("[]"),  // [{role, content, createdAt}]
  status:       text("status").default("active"), // active | completed | abandoned
  score:        integer("score"),                   // 0-100
  evaluation:   jsonb("evaluation"),                // {criteria: [{name, pass, note}], recommendations: []}
  startedAt:    timestamp("started_at").defaultNow(),
  completedAt:  timestamp("completed_at"),
})

// ─── Gamification: user achievements ─────────────────────────────────────────

export const userAchievements = pgTable("user_achievements", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type:       text("type").notNull(),       // lesson | course | test_perfect | training
  points:     integer("points").notNull(),  // +10 | +50 | +30 | +20
  sourceId:   text("source_id"),            // id урока/курса/тренировки
  note:       text("note"),                 // описание (опционально)
  earnedAt:   timestamp("earned_at").defaultNow(),
})

// ─── HH.ru Integration ──────────────────────────────────────────────────────

export const hhIntegrations = pgTable("hh_integrations", {
  id:              uuid("id").primaryKey().defaultRandom(),
  companyId:       uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  employerId:      text("employer_id").notNull(),
  employerName:    text("employer_name"),
  accessToken:     text("access_token").notNull(),
  refreshToken:    text("refresh_token").notNull(),
  tokenExpiresAt:  timestamp("token_expires_at").notNull(),
  connectedBy:     uuid("connected_by").references(() => users.id),
  lastSyncedAt:    timestamp("last_synced_at"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
})

export const hhVacancies = pgTable("hh_vacancies", {
  id:              uuid("id").primaryKey().defaultRandom(),
  companyId:       uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  hhVacancyId:     text("hh_vacancy_id").notNull(),
  title:           text("title").notNull(),
  areaName:        text("area_name"),
  salaryFrom:      integer("salary_from"),
  salaryTo:        integer("salary_to"),
  salaryCurrency:  text("salary_currency"),
  status:          text("status").notNull().default("open"),
  responsesCount:  integer("responses_count").default(0),
  url:             text("url"),
  localVacancyId:  uuid("local_vacancy_id").references(() => vacancies.id),
  rawData:         jsonb("raw_data"),
  syncedAt:        timestamp("synced_at").defaultNow(),
  createdAt:       timestamp("created_at").defaultNow(),
}, (t) => [
  unique("uq_hh_vacancies_company_hh").on(t.companyId, t.hhVacancyId),
])

export const hhResponses = pgTable("hh_responses", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  companyId:          uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  hhVacancyId:        text("hh_vacancy_id").notNull(),
  hhResponseId:       text("hh_response_id").notNull(),
  candidateName:      text("candidate_name"),
  candidatePhone:     text("candidate_phone"),
  candidateEmail:     text("candidate_email"),
  resumeTitle:        text("resume_title"),
  resumeUrl:          text("resume_url"),
  status:             text("status").notNull().default("new"),
  rawData:            jsonb("raw_data"),
  localCandidateId:   uuid("local_candidate_id"),
  // Cron /api/cron/hh-incoming-messages: ID последнего обработанного
  // applicant-сообщения и момент последней проверки.
  lastSeenMessageId:  text("last_seen_message_id"),
  lastCheckAt:        timestamp("last_check_at"),
  // Кэш переписки hh (нормализованные сообщения) — показываем сохранённую
  // переписку, когда токен hh отвалился. Обновляется при успешном фетче.
  messagesCache:      jsonb("messages_cache"),
  messagesCachedAt:   timestamp("messages_cached_at"),
  syncedAt:           timestamp("synced_at").defaultNow(),
  createdAt:          timestamp("created_at").defaultNow(),
}, (t) => [
  unique("uq_hh_responses_company_response").on(t.companyId, t.hhResponseId),
])

// Legacy alias — old code references hhTokens
export const hhTokens = hhIntegrations

// ─── Авито-интеграция (скелет, фаза 1 — миграция 0187) ───────────────────────
//
// Feature-flag: is_enabled=false по умолчанию; HR включает в Настройки → Интеграции.
// Реальный OAuth-флоу и send/receive реализуются в фазе 2 (lib/channels/avito.ts).
// Подробности: docs/AVITO-INTEGRATION-PLAN.md
export const avitoIntegrations = pgTable("avito_integrations", {
  id:             uuid("id").primaryKey().defaultRandom(),
  companyId:      uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  // Числовой user_id пользователя Авито (нужен для путей Messenger API).
  userId:         text("user_id"),
  // OAuth ключи компании (client_credentials path).
  clientId:       text("client_id"),
  clientSecret:   text("client_secret"),
  // Кэшированный access_token (обновляется адаптером).
  accessToken:    text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  connectedBy:    uuid("connected_by").references(() => users.id),
  lastSyncedAt:   timestamp("last_synced_at"),
  // Feature-flag: выключено по умолчанию.
  isEnabled:      boolean("is_enabled").notNull().default(false),
  // Системный статус: false если токен отозван / интеграция сломана.
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Исходящий подбор (hh outbound sourcing), Фаза 1 — миграция 0159 ─────────
// Поток: критерии → hh GET /resumes → сохранить найденные сниппеты →
// AI-скоринг по сниппетам → HR отмечает лучших → приглашение через negotiations
// → кандидат в воронке (source='hh_outbound'). См. ТЗ «Исходящий подбор».

// Сохранённый поисковый запрос / кампания по вакансии.
// mode='manual'  — разовый поиск (текущее поведение).
// mode='auto'    — кампания: cron периодически запускает поиск, скорит и
//                  автоматически приглашает кандидатов с ai_score >= scoreThreshold.
// softCriteria   — текстовое описание «мягких» пожеланий для AI-скоринга
//                  (передаётся в screenCandidate как дополнительный контекст).
// active=true    — кампания активна (cron её подхватывает).
export const outboundSearches = pgTable("outbound_searches", {
  id:              uuid("id").primaryKey().defaultRandom(),
  companyId:       uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  vacancyId:       uuid("vacancy_id").notNull().references(() => vacancies.id, { onDelete: "cascade" }),
  criteria:        jsonb("criteria").notNull().default({}),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastRunAt:       timestamp("last_run_at", { withTimezone: true }),
  // campaign fields (migration 0181)
  mode:            text("mode").notNull().default("manual"),
  scoreThreshold:  integer("score_threshold").notNull().default(70),
  dailyAutoLimit:  integer("daily_auto_limit").notNull().default(10),
  softCriteria:    text("soft_criteria"),
  active:          boolean("active").notNull().default(false),
  cronRunAt:       timestamp("cron_run_at", { withTimezone: true }),
})

// Найденное резюме из поиска hh. snippet — сырой сниппет из выдачи GET /resumes
// (НЕ расходует лимит просмотров). ai_score/ai_reasoning заполняются скорером.
// status: found | viewed | invited | responded | skipped.
export const outboundCandidates = pgTable("outbound_candidates", {
  id:           uuid("id").primaryKey().defaultRandom(),
  searchId:     uuid("search_id").notNull().references(() => outboundSearches.id, { onDelete: "cascade" }),
  companyId:    uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  vacancyId:    uuid("vacancy_id").notNull().references(() => vacancies.id, { onDelete: "cascade" }),
  hhResumeId:   text("hh_resume_id").notNull(),
  title:        text("title"),
  snippet:      jsonb("snippet"),
  aiScore:      integer("ai_score"),
  aiReasoning:  text("ai_reasoning"),
  status:       text("status").notNull().default("found"),
  invitedAt:    timestamp("invited_at", { withTimezone: true }),
  viewedAt:     timestamp("viewed_at", { withTimezone: true }),
  candidateId:  uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("uq_outbound_candidates_vacancy_resume").on(t.vacancyId, t.hhResumeId),
])

// Дневной учёт расхода лимита просмотров резюме hh по компании.
//   viewsFromSearch — просмотры из поисковой выдачи (лимит 50/день на менеджера)
//   totalViews      — суммарные уникальные просмотры (лимит 500/день)
export const hhResumeViewQuota = pgTable("hh_resume_view_quota", {
  companyId:        uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  date:             date("date").notNull(),
  viewsFromSearch:  integer("views_from_search").notNull().default(0),
  totalViews:       integer("total_views").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.companyId, t.date] }),
])

// Async tracking разбора hh-очереди (Сессия 7).
// POST /api/integrations/hh/process-queue создаёт строку и сразу возвращает
// jobId; UI делает polling /status?jobId=...
export const hhProcessJobs = pgTable("hh_process_jobs", {
  id:                uuid("id").primaryKey().defaultRandom(),
  companyId:         uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  vacancyId:         uuid("vacancy_id").references(() => vacancies.id, { onDelete: "set null" }),
  status:            text("status").notNull().default("queued"), // 'queued'|'running'|'completed'|'failed'|'stopped'
  limitRequested:    integer("limit_requested"),
  delaySeconds:      integer("delay_seconds"),
  processed:         integer("processed").notNull().default(0),
  invited:           integer("invited").notNull().default(0),
  rejected:          integer("rejected").notNull().default(0),
  kept:              integer("kept").notNull().default(0),
  deferredOffHours:  integer("deferred_off_hours").notNull().default(0),
  results:           jsonb("results").notNull().default([]),
  error:             text("error"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt:         timestamp("started_at", { withTimezone: true }),
  finishedAt:        timestamp("finished_at", { withTimezone: true }),
})

// ─── Learning Plans ─────────────────────────────────────────────────────────

export const learningPlans = pgTable("learning_plans", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  materials:   jsonb("materials").notNull().default("[]"),
  createdBy:   uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const learningAssignments = pgTable("learning_assignments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  planId:      uuid("plan_id").references(() => learningPlans.id, { onDelete: "cascade" }).notNull(),
  userId:      uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  status:      text("status").notNull().default("assigned"),
  progress:    jsonb("progress").notNull().default("{}"),
  assignedAt:  timestamp("assigned_at").defaultNow(),
  deadline:    timestamp("deadline"),
  completedAt: timestamp("completed_at"),
  // URL публичной страницы сертификата (см. app/certificate/[assignmentId])
  certificateUrl: text("certificate_url"),
})

// ─── Booking: Услуги ─────────────────────────────────────────────────────────

export const bookingServices = pgTable("booking_services", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  duration:    integer("duration").notNull().default(60),  // минуты
  price:       integer("price"),                           // копейки
  currency:    text("currency").default("RUB"),
  color:       text("color").default("#3B82F6"),
  isActive:    boolean("is_active").default(true),
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Booking: Ресурсы/Специалисты ───────────────────────────────────────────

export const bookingResources = pgTable("booking_resources", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  type:        text("type").default("specialist"),  // specialist / room / equipment
  description: text("description"),
  avatar:      text("avatar"),
  isActive:    boolean("is_active").default(true),
  schedule:    jsonb("schedule"),   // { mon: {start,end,active}, ... }
  breaks:      jsonb("breaks"),     // [{start,end}]
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Booking: Записи ─────────────────────────────────────────────────────────

export const bookings = pgTable("bookings", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  serviceId:   uuid("service_id").references(() => bookingServices.id, { onDelete: "cascade" }).notNull(),
  resourceId:  uuid("resource_id").references(() => bookingResources.id, { onDelete: "set null" }),
  contactId:   uuid("contact_id").references(() => salesContacts.id, { onDelete: "set null" }),
  clientName:  text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  date:        date("date").notNull(),
  startTime:   text("start_time").notNull(),   // "10:00"
  endTime:     text("end_time").notNull(),     // "11:00"
  status:      text("status").default("confirmed").notNull(),  // confirmed/completed/cancelled/no_show
  notes:       text("notes"),
  price:       integer("price"),               // копейки
  isPaid:      boolean("is_paid").default(false),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Vacancy Demos ──────────────────────────────────────────────────────────

export const vacancyDemos = pgTable("vacancy_demos", {
  id:          uuid("id").primaryKey().defaultRandom(),
  vacancyId:   uuid("vacancy_id").references(() => vacancies.id, { onDelete: "cascade" }).notNull(),
  templateId:  uuid("template_id").references(() => demoTemplates.id),
  name:        text("name").notNull(),
  status:      text("status").notNull().default("draft"),
  sections:    jsonb("sections").notNull().default("[]"),
  settings:    jsonb("settings").default("{}"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Departments ─────────────────────────────────────────────────────────────

export const departments = pgTable("departments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  parentId:    uuid("parent_id"),  // self-reference handled at DB level
  headUserId:  uuid("head_user_id").references(() => users.id, { onDelete: "set null" }),
  modules:     jsonb("modules").default("[]"), // ["hr", "crm", "learning"]
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Positions ───────────────────────────────────────────────────────────────

export const positions = pgTable("positions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  name:         text("name").notNull(),
  description:  text("description"),
  grade:        text("grade"),
  salaryMin:    integer("salary_min"),
  salaryMax:    integer("salary_max"),
  // Legacy: одиночный сотрудник. Источник правды теперь positionEmployees
  // (many-to-many). userId держим синхронизированным с «первым» сотрудником
  // для обратной совместимости старых читателей.
  userId:       uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

// Сотрудники на должности (вариант B: много сотрудников на одну должность).
export const positionEmployees = pgTable("position_employees", {
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.positionId, t.userId)])

// ─── User Module Roles ───────────────────────────────────────────────────────

export const userModuleRoles = pgTable("user_module_roles", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  moduleId:  text("module_id").notNull(), // 'hr' | 'crm' | 'logistics' | 'marketing' | etc.
  role:      text("role").notNull().default("none"), // 'admin' | 'manager' | 'viewer' | 'none'
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.tenantId, t.userId, t.moduleId)])

// ─── Vacancy Intake (заявки от заказчиков) ───────────────────────────────────

export const vacancyIntakeLinks = pgTable("vacancy_intake_links", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  token:     text("token").unique().notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  password:  text("password"),
  status:    text("status").default("active"), // 'active' | 'used' | 'expired'
  reusable:  boolean("reusable").default(false),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── AI Audit Log ────────────────────────────────────────────────────────────

export const aiAuditLog = pgTable("ai_audit_log", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  action:         text("action").notNull(), // 'screen_candidate' | 'auto_invite' | 'auto_reject' | 'generate_offer' | 'compare_candidates'
  vacancyId:      uuid("vacancy_id").references(() => vacancies.id, { onDelete: "set null" }),
  candidateId:    uuid("candidate_id"),
  inputSummary:   text("input_summary"),
  outputSummary:  text("output_summary"),
  createdAt:      timestamp("created_at").defaultNow(),
})

// ─── Comparison Links ─────────────────────────────────────────────────────────

export const comparisonLinks = pgTable("comparison_links", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  token:     text("token").unique().notNull(),
  password:  text("password").notNull(),
  data:      jsonb("data").notNull(), // comparison result JSON
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Support Requests ────────────────────────────────────────────────────────

export const supportRequests = pgTable("support_requests", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id).notNull(),
  type:      text("type").notNull(), // 'email_change' | 'other'
  data:      jsonb("data").notNull(), // { newEmail, reason, ... }
  status:    text("status").default("new"), // 'new' | 'processing' | 'done' | 'rejected'
  createdAt: timestamp("created_at").defaultNow(),
})

export const vacancyGuestLinks = pgTable("vacancy_guest_links", {
  id:          uuid("id").primaryKey().defaultRandom(),
  vacancyId:   uuid("vacancy_id").references(() => vacancies.id, { onDelete: "cascade" }).notNull(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  token:       text("token").unique().notNull(),
  password:    text("password"),
  permissions: jsonb("permissions").default('{"view": true}'),
  expiresAt:   timestamp("expires_at"),
  createdAt:   timestamp("created_at").defaultNow(),
})

export const vacancyIntakes = pgTable("vacancy_intakes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  linkId:    uuid("link_id").references(() => vacancyIntakeLinks.id, { onDelete: "set null" }),
  data:      jsonb("data").notNull(), // form fields
  files:     jsonb("files").default("[]"), // uploaded file references
  status:    text("status").default("new"), // 'new' | 'processed' | 'rejected'
  vacancyId: uuid("vacancy_id").references(() => vacancies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Activity Log ────────────────────────────────────────────────────────────

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  entityTitle: text("entity_title"),
  module: text("module"),
  details: jsonb("details").default("{}"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Goals (Координатор Целей) ───────────────────────────────────────────────
// Годовые / месячные / недельные цели пользователя. Прогресс обновляется
// вручную (автотрекинг — следующая фаза). Используется на /goals и
// /morning-brief.

export const goals = pgTable("goals", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  parentId:       uuid("parent_id"),
  level:          text("level").notNull(),            // 'yearly' | 'monthly' | 'weekly'
  title:          text("title").notNull(),
  description:    text("description"),
  targetValue:    text("target_value"),               // numeric as text (напр. "50")
  targetUnit:     text("target_unit"),                // "млн ₽", "контрактов", ...
  currentValue:   text("current_value").default("0"), // numeric as text
  deadline:       date("deadline"),
  isFocusToday:   boolean("is_focus_today").default(false),
  status:         text("status").notNull().default("active"), // 'active' | 'completed' | 'paused' | 'archived'
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

// ─── Legal Documents ─────────────────────────────────────────────────────────
// Юридические документы (политика конфиденциальности, оферта и др.) —
// редактируются через /settings/legal только администратором платформы,
// рендерятся на публичных страницах вроде /politicahr2026.

export const legalDocuments = pgTable("legal_documents", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").notNull().unique(),       // 'privacy_policy', 'terms_of_use', ...
  title:       text("title").notNull(),
  contentHtml: text("content_html").notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

// ─── Password reset tokens ───────────────────────────────────────────────────
// Сброс пароля по email. Токен хешируется (SHA-256) перед записью в БД,
// сам токен присылается пользователю в ссылке. TTL — 1 час.

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash:  text("token_hash").notNull().unique(),
  expiresAt:  timestamp("expires_at").notNull(),
  usedAt:     timestamp("used_at"),
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
})

// drizzle/0248 — одноразовый код привязки Telegram-бота базы знаний к
// пользователю платформы. Раньше бот привязывался по «/start email» без
// верификации владения (аудит 04.07) — теперь код выдаётся в UI залогиненному
// пользователю (личность подтверждена сессией) и одноразово гасится при /start.
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code:      text("code").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Какой бот привязывается: 'knowledge_base' (компанейский бот БЗ,
  // users.telegramChatId) | 'manager_reminders' (платформенный бот
  // напоминаний об интервью, users.managerReminderChatId). Миграция 0270.
  purpose: text("purpose").notNull().default("knowledge_base"),
})

// drizzle/0249 — WebAuthn/passkey: беспарольный вход по ключу устройства
// (Face ID / отпечаток / аппаратный ключ). Пароль остаётся запасным входом.
// publicKey/credentialId хранятся в base64url; counter — защита от клонирования.
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey:    text("public_key").notNull(),
  counter:      bigint("counter", { mode: "number" }).notNull().default(0),
  transports:   text("transports").array(),
  deviceName:   text("device_name"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt:   timestamp("last_used_at", { withTimezone: true }),
})

// ─── Follow-up Campaigns (Воронка дожима) ────────────────────────────────────
// Цепочка автоматических напоминаний кандидату с hh.ru, если он не открыл
// демо или не допрошёл его до конца. Настраивается на уровне вакансии:
// один из 4 пресетов (off/soft/standard/aggressive) и кастомные тексты.

// Ответы кандидата на вопросы предквалификации (Сессия 6).
// Заполняется backend'ом после получения ответа кандидата в hh-чате
// и AI-вердикта Haiku. См. lib/prequalification/* (TODO в Сессии 6b).
export const candidateQualificationAnswers = pgTable("candidate_qualification_answers", {
  id:            uuid("id").primaryKey().defaultRandom(),
  candidateId:   uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  vacancyId:     uuid("vacancy_id").notNull().references(() => vacancies.id, { onDelete: "cascade" }),
  questionText:  text("question_text").notNull(),
  answerText:    text("answer_text"),
  // 'passed' | 'failed' | 'unclear' | NULL (ещё ждём)
  aiVerdict:     text("ai_verdict"),
  aiReasoning:   text("ai_reasoning"),
  // Snapshot значения required на момент создания записи. Если HR потом
  // поменяет требование в настройках — этот ответ сохранит свою критичность.
  isCritical:    boolean("is_critical").notNull().default(false),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const followUpCampaigns = pgTable("follow_up_campaigns", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  vacancyId:            uuid("vacancy_id").notNull().references(() => vacancies.id, { onDelete: "cascade" }),
  preset:               text("preset").notNull().default("off"), // 'off' | 'soft' | 'standard' | 'aggressive'
  enabled:              boolean("enabled").notNull().default(false),
  stopOnReply:          boolean("stop_on_reply").notNull().default(true),
  stopOnVacancyClosed:  boolean("stop_on_vacancy_closed").notNull().default(true),
  // Кастомные тексты ветки А (кандидат не открыл демо).
  customMessages:       jsonb("custom_messages").$type<string[] | null>(),
  // Кастомные тексты ветки Б (открыл, но не дошёл до конца).
  customMessagesOpened: jsonb("custom_messages_opened").$type<string[] | null>(),
  // ── Дожим по тесту (две ветки), независим от демо-дожима. ──
  testEnabled:          boolean("test_enabled").notNull().default(false),
  testPreset:           text("test_preset").notNull().default("off"),
  testMessages:         jsonb("test_messages").$type<string[] | null>(),        // ветка «не открыл тест»
  testMessagesOpened:   jsonb("test_messages_opened").$type<string[] | null>(),  // ветка «открыл, но не заполнил»
  // drizzle/0259 — гейт «не дожимать кандидатов с Портретом (resume_score)
  // ниже N». Дефолт ВЫКЛ (legacy-инвариант, см. PRODUCT-STANDARDS.md §3).
  // Тексты дожима НЕ меняем — это отдельный скип на уровне отправки одного
  // касания (см. app/api/cron/follow-up/route.ts).
  minPortraitScoreEnabled: boolean("min_portrait_score_enabled").notNull().default(false),
  minPortraitScore:        integer("min_portrait_score").notNull().default(30),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
})

export const followUpMessages = pgTable("follow_up_messages", {
  id:           uuid("id").defaultRandom().primaryKey(),
  campaignId:   uuid("campaign_id").notNull().references(() => followUpCampaigns.id, { onDelete: "cascade" }),
  candidateId:  uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  scheduledAt:  timestamp("scheduled_at").notNull(),
  sentAt:       timestamp("sent_at"),
  touchNumber:  integer("touch_number").notNull(),
  channel:      text("channel").notNull(), // 'hh' | 'email' | 'telegram'
  messageText:  text("message_text").notNull(),
  status:       text("status").notNull().default("pending"), // 'pending' | 'sent' | 'failed' | 'cancelled'
  // Ветка дожима: 'not_opened' (А) | 'opened_not_finished' (Б).
  branch:       text("branch").notNull().default("not_opened"),
  errorMessage: text("error_message"),
  // Д0 цепочки — исходная точка отсчёта расписания касаний. Обычно
  // совпадает с negotiation.created_at hh-отклика. scheduled_at от
  // chain_d0 отличается на dayOffset + jitter + сдвиг окном работы.
  chainD0:        timestamp("chain_d0", { withTimezone: true }),
  // 'hh_response' | 'manual_review' | 'branch_switch'
  chainD0Source:  text("chain_d0_source"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
})

// Group 14: журнал «миграций настроек платформы». Runner в
// lib/platform/settings-migrations.ts перед каждой попыткой apply() ищет
// запись по id — если она уже есть, миграция считается применённой
// и пропускается. Это делает массовые правки настроек безопасно
// повторяемыми (идемпотентными).
export const platformSettingsMigrations = pgTable("platform_settings_migrations", {
  id:             text("id").primaryKey(),
  description:    text("description").notNull(),
  appliedAt:      timestamp("applied_at", { withTimezone: true }),
  affectedCount:  integer("affected_count").notNull().default(0),
  rollbackData:   jsonb("rollback_data"),
  createdBy:      text("created_by"),
  notes:          text("notes"),
}, (t) => [
  index("idx_psm_applied").on(t.appliedAt),
])

// Платформенные KV-настройки (drizzle/0154). Первое применение —
// 'trash_retention_days' (срок авто-удаления единой Корзины /admin/clients).
export const platformSettings = pgTable("platform_settings", {
  key:       text("key").primaryKey(),
  value:     jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Group 14: журнал «emergency broadcast» действий — kill switch AI-чат-бота
// у всех компаний, добавление глобального стоп-слова и т.п. Любой POST на
// /api/platform/emergency/* пишет сюда строку с payload и result.
export const platformEmergencyActions = pgTable("platform_emergency_actions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  actionType:   text("action_type").notNull(),
  payload:      jsonb("payload"),
  executedAt:   timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  executedBy:   text("executed_by"),
  result:       jsonb("result"),
}, (t) => [
  index("idx_pea_executed").on(t.executedAt),
])

// P0-30: журнал запусков критичных cron-эндпоинтов. Пишется каждым cron'ом
// (recordCronRun из lib/cron/record-run.ts), читается health-check endpoint.
export const cronRuns = pgTable("cron_runs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  cronName:     text("cron_name").notNull(),
  startedAt:    timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt:   timestamp("finished_at", { withTimezone: true }),
  status:       text("status").notNull().default("running"), // 'running' | 'ok' | 'error' | 'busy'
  durationMs:   integer("duration_ms"),
  errorMessage: text("error_message"),
  metadata:     jsonb("metadata"),
}, (t) => [
  index("cron_runs_name_started_idx").on(t.cronName, t.startedAt),
])

// Dev-activity tracker — журнал продуктивности подрядчика по его репозиториям
// на отдельном сервере. Одна строка = один день одного человека (агрегат по
// всем его репо; разбивка по репо и список задач — в jsonb). Заполняется
// cron'ом /api/cron/dev-activity (SSH → git → Claude). Читается страницей
// /admin/dev-activity. Подробности — lib/dev-activity/*.
export const devActivityDays = pgTable("dev_activity_days", {
  id:           uuid("id").primaryKey().defaultRandom(),
  project:      text("project").notNull().default("market-radar"), // ключ проекта (таба)
  person:       text("person").notNull(),                       // ярлык исполнителя
  day:          date("day").notNull(),                          // календарный день (МСК)
  commitCount:  integer("commit_count").notNull().default(0),
  linesAdded:   integer("lines_added").notNull().default(0),
  linesRemoved: integer("lines_removed").notNull().default(0),
  wipFiles:     integer("wip_files").notNull().default(0),      // незакоммичено на момент сбора
  workMinutes:  integer("work_minutes").notNull().default(0),   // оценка времени работы по коммитам
  firstAt:      timestamp("first_at", { withTimezone: true }),  // первый коммит дня
  lastAt:       timestamp("last_at", { withTimezone: true }),   // последний коммит дня
  taskCount:    integer("task_count").notNull().default(0),     // осмысленные задачи (Claude)
  score:        doublePrecision("score").notNull().default(0),  // взвешенная продуктивность дня
  substance:    text("substance"),                              // 'trivial'|'normal'|'substantial'
  verdict:      text("verdict"),                                // 'silence'|'below'|'normal'|'above'|'warmup'
  baseline:     doublePrecision("baseline"),                    // скользящая норма для сравнения
  summary:      text("summary"),                                // журнал дня человеческим языком
  tasks:        jsonb("tasks"),                                 // [{repo,title,kind}]
  repos:        jsonb("repos"),                                 // [{repo,commits,added,removed,wip}]
  raw:          jsonb("raw"),                                   // сырьё сбора (для пере-разбора)
  collectedAt:  timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("dev_activity_project_day").on(t.project, t.day),
  index("dev_activity_day_idx").on(t.day),
])

// Group 15: библиотека пер-компанийных шаблонов воронки.
// config_json хранит массив { type, order, enabled } — тот же формат, что в
// vacancies.funnel_config_json. При применении копируется в вакансию.
// is_default = true — стартовый шаблон для новых вакансий компании. Только
// один шаблон на компанию может быть default (см. uniq_cft_default_per_company
// в drizzle/0130_company_funnel_templates.sql).
export const companyFunnelTemplates = pgTable("company_funnel_templates", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  configJson:  jsonb("config_json").notNull(),
  isDefault:   boolean("is_default").notNull().default(false),
  createdBy:   uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_cft_company").on(t.companyId),
])

// Менеджер пресетов дожима (Issue 12.06): СВОИ пресеты HR компании — именованные
// бандлы расписания + текстов касаний. Системные (soft/standard/aggressive)
// виртуальны (из lib/followup/presets.ts + default-messages.ts), в таблице НЕ
// хранятся — всегда доступны read-only и копируемы. Здесь только пользовательские.
export const companyFollowupPresets = pgTable("company_followup_presets", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  companyId:          uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:               text("name").notNull(),
  description:        text("description"),
  // Расписание касаний (как followUpCampaigns.preset) + опц. кастомные дни.
  preset:             text("preset").notNull().default("standard"), // off|soft|standard|aggressive
  customDays:         jsonb("custom_days").$type<number[] | null>(),
  // Тексты касаний (9 слотов). Ветка «не открыл» — основная; остальные опц.
  messages:           jsonb("messages").$type<string[] | null>(),
  messagesOpened:     jsonb("messages_opened").$type<string[] | null>(),
  testPreset:         text("test_preset"),
  testMessages:       jsonb("test_messages").$type<string[] | null>(),
  testMessagesOpened: jsonb("test_messages_opened").$type<string[] | null>(),
  createdBy:          uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_cfp_company").on(t.companyId),
])

// Group 16: библиотека пер-платформенных шаблонов воронки.
// Создаёт platform-admin (через /admin/platform → Templates). Видна всем
// HR компаниям через GET /api/modules/hr/funnel-templates/platform
// (только is_published=true). source_* — для аудита.
export const platformFunnelTemplates = pgTable("platform_funnel_templates", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             text("name").notNull(),
  description:      text("description"),
  industry:         text("industry"),
  configJson:       jsonb("config_json").notNull(),
  sourceVacancyId:  uuid("source_vacancy_id").references(() => vacancies.id, { onDelete: "set null" }),
  sourceCompanyId:  uuid("source_company_id").references(() => companies.id, { onDelete: "set null" }),
  isPublished:      boolean("is_published").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Группа 28: AI-помощник «Юлия» ─────────────────────────────────────────
// Внутренний HR-ассистент для создания вакансии через короткий диалог.
// НЕ путать с Аней — sales-ассистентом на лендинге Company24.
// Миграция drizzle/0133_yulia_conversations.sql.

export interface YuliaConversationState {
  // Накапливаемые данные в процессе диалога. Произвольный bag — Юлия пишет
  // сюда то, что нужно текущему context_type, без жёсткой схемы.
  [k: string]: unknown
}

export interface YuliaPendingAction {
  type:                   string                  // "create_vacancy_draft" | (future)
  params:                 Record<string, unknown>
  requires_confirmation?: boolean
}

export const yuliaConversations = pgTable("yulia_conversations", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  companyId:          uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  contextType:        text("context_type").notNull(),                  // "vacancy_creation"
  state:              jsonb("state").$type<YuliaConversationState>().notNull().default({}),
  status:             text("status").notNull().default("active"),      // active | completed | abandoned
  resultingEntityId:  uuid("resulting_entity_id"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_yulia_conv_user").on(t.userId, t.status),
  index("idx_yulia_conv_company").on(t.companyId, t.createdAt),
])

export const yuliaMessages = pgTable("yulia_messages", {
  id:             uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").references(() => yuliaConversations.id, { onDelete: "cascade" }).notNull(),
  role:           text("role").notNull(),                              // user | assistant
  content:        text("content").notNull(),
  pendingAction:  jsonb("pending_action").$type<YuliaPendingAction>(),
  actionStatus:   text("action_status"),                               // null | pending | confirmed | rejected | executed
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_yulia_msg_conv").on(t.conversationId, t.createdAt),
])

// drizzle/0163 — публичные ссылки на сравнение кандидатов (без логина).
export const compareShares = pgTable("compare_shares", {
  id:           uuid("id").primaryKey().defaultRandom(),
  token:        text("token").notNull().unique(),
  companyId:    uuid("company_id").notNull(),
  vacancyId:    uuid("vacancy_id").notNull(),
  candidateIds: jsonb("candidate_ids").notNull(),
  createdBy:    uuid("created_by"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt:    timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt:    timestamp("revoked_at", { withTimezone: true }),
})

// Внутренние наборы сравнения — для коротких HR-ссылок ?set=<token>.
// Без срока жизни и без публичного доступа (в отличие от compareShares).
export const compareSets = pgTable("compare_sets", {
  id:           uuid("id").primaryKey().defaultRandom(),
  token:        text("token").notNull().unique(),
  companyId:    uuid("company_id").notNull(),
  vacancyId:    uuid("vacancy_id").notNull(),
  candidateIds: jsonb("candidate_ids").notNull(),
  createdBy:    uuid("created_by"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// Публичная ссылка на «Отчёт по найму» (без логина, только чтение).
// Один активный токен на компанию (перегенерация отзывает старый). Срока жизни
// нет — дашборд может висеть на ТВ. Период/вакансия передаются query-параметрами
// в самой ссылке, поэтому один токен обслуживает любой срез.
export const reportShares = pgTable("report_shares", {
  id:        uuid("id").primaryKey().defaultRandom(),
  token:     text("token").notNull().unique(),
  companyId: uuid("company_id").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

// ─── R4 Candidate Spec (новый контур, миграция 0197) ─────────────────────────
// Единый источник «кого ищем» для вакансии. СПЯЩИЙ КОД — не подключён к
// рантайму скоринга/чат-бота. Активация — через флаг useNewCore per-вакансия.
//
// spec: CandidateSpec (lib/core/spec/types.ts) — jsonb-документ с четырьмя
//   секциями: criteria (must/nice/dealbreaker, веса, кастомные оси),
//   stopFactors, thresholds (единые пороги), profile (идеальный профиль).
// updated_by: FK на users.id — кто последний изменил Spec (nullable).
//
// PK = vacancy_id (один Spec на вакансию). При удалении вакансии →
// CASCADE (строка spec удаляется автоматически).
export const vacancySpecs = pgTable("vacancy_specs", {
  vacancyId: uuid("vacancy_id")
    .primaryKey()
    .references(() => vacancies.id, { onDelete: "cascade" }),
  spec:      jsonb("spec").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
})

// ─── Яндекс.Директ AI-агент (миграция 0202) ─────────────────────────────────
// Модуль marketing: подключение Яндекс.Директа по OAuth, синк кампаний и
// статистики, AI-агент (создание кампаний на поиске/РСЯ + оптимизация).
// Деньги храним в рублях (number), конвертация в микроединицы API (×1 000 000)
// — только внутри lib/yandex-direct/client.ts.

export interface YandexDirectAgentSettings {
  mode:                 "recommend" | "autopilot" // autopilot — агент сам применяет безопасные действия
  targetCpa?:           number                    // целевой CPA, ₽ (ориентир для оптимизатора)
  maxCpc?:              number                    // потолок ставки за клик, ₽ (автопилот не поднимет выше)
  dailyBudgetLimit?:    number                    // потолок дневного бюджета кампании, ₽
  minClicksForDecision: number                    // не трогать ключ, пока не набрал N кликов (default 30)
  analysisPeriodDays:   number                    // окно анализа статистики (default 14)
  pausedByAgentEnabled: boolean                   // разрешить автопилоту останавливать ключи/кампании
}

export const YANDEX_DIRECT_AGENT_DEFAULTS: YandexDirectAgentSettings = {
  mode: "recommend",
  minClicksForDecision: 30,
  analysisPeriodDays: 14,
  pausedByAgentEnabled: true,
}

// Личные видео-интеграции менеджера (Юрий 10.07: «каждый менеджер имеет свой
// Зум»). Один ряд на пару (userId, provider) — НЕ на компанию, в отличие от
// hh/Яндекс.Директ: у каждого сотрудника своя учётка Zoom/Телемоста, встречу
// создаёт от своего имени тот, кто назначен интервьюером в calendar_events.
export const userVideoIntegrations = pgTable("user_video_integrations", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider:             text("provider").notNull(), // zoom | yandex_telemost
  externalAccountEmail: text("external_account_email"),
  accessToken:          text("access_token").notNull(),
  refreshToken:         text("refresh_token"),
  tokenExpiresAt:       timestamp("token_expires_at", { withTimezone: true }),
  isActive:             boolean("is_active").notNull().default(true),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.userId, t.provider)])

export const yandexDirectIntegrations = pgTable("yandex_direct_integrations", {
  id:               uuid("id").primaryKey().defaultRandom(),
  companyId:        uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  yandexLogin:      text("yandex_login"),                 // логин аккаунта Директа (из OAuth userinfo)
  accessToken:      text("access_token").notNull(),
  refreshToken:     text("refresh_token"),
  tokenExpiresAt:   timestamp("token_expires_at", { withTimezone: true }),
  connectedBy:      uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  agentSettingsJson: jsonb("agent_settings_json").$type<YandexDirectAgentSettings>(),
  lastSyncedAt:     timestamp("last_synced_at", { withTimezone: true }),
  isActive:         boolean("is_active").notNull().default(true),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// Зеркало кампаний Директа (источник правды — API, синк перезаписывает).
export const yandexDirectCampaigns = pgTable("yandex_direct_campaigns", {
  id:           uuid("id").primaryKey().defaultRandom(),
  companyId:    uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  directId:     bigint("direct_id", { mode: "number" }).notNull(),  // Id кампании в Директе
  name:         text("name").notNull(),
  campaignType: text("campaign_type").notNull().default("TEXT_CAMPAIGN"),
  placement:    text("placement"),                  // search | network | mixed (по стратегиям)
  state:        text("state"),                      // ON | OFF | SUSPENDED | ENDED | ARCHIVED
  status:       text("status"),                     // ACCEPTED | MODERATION | DRAFT | REJECTED
  dailyBudget:  doublePrecision("daily_budget"),    // ₽/день (null = недельная стратегия)
  createdByAgent: boolean("created_by_agent").notNull().default(false),
  raw:          jsonb("raw"),                       // полный объект из API (на будущее)
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("yd_campaigns_company_direct_idx").on(t.companyId, t.directId),
])

// Дневная статистика кампаний (Reports API). Upsert по (company, campaign, date).
export const yandexDirectCampaignStats = pgTable("yandex_direct_campaign_stats", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  directId:    bigint("direct_id", { mode: "number" }).notNull(),
  date:        text("date").notNull(),               // YYYY-MM-DD
  impressions: integer("impressions").notNull().default(0),
  clicks:      integer("clicks").notNull().default(0),
  cost:        doublePrecision("cost").notNull().default(0),        // ₽
  conversions: integer("conversions").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("yd_stats_company_campaign_date_idx").on(t.companyId, t.directId, t.date),
])

export interface YandexDirectActionPayload {
  // Параметры действия — состав зависит от type (см. lib/yandex-direct/agent.ts)
  [k: string]: unknown
}

// Журнал агента: рекомендации и применённые действия. Каждое действие
// автопилота тоже пишется сюда (status='applied', appliedBy=null → автопилот).
export const yandexDirectAgentActions = pgTable("yandex_direct_agent_actions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  directCampaignId: bigint("direct_campaign_id", { mode: "number" }),
  type:        text("type").notNull(),       // pause_keyword | add_negative_keywords | set_keyword_bid | pause_campaign | set_daily_budget | insight
  title:       text("title").notNull(),      // короткий заголовок по-русски
  description: text("description").notNull(),// объяснение агента «почему»
  payload:     jsonb("payload").$type<YandexDirectActionPayload>(),
  impact:      text("impact"),               // high | medium | low
  status:      text("status").notNull().default("proposed"), // proposed | applied | dismissed | failed
  source:      text("source").notNull().default("agent"),    // agent | autopilot
  appliedBy:   uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
  appliedAt:   timestamp("applied_at", { withTimezone: true }),
  error:       text("error"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("yd_actions_company_status_idx").on(t.companyId, t.status, t.createdAt),
])

// ─── Nancy Feedback (миграция 0199) ──────────────────────────────────────────
// Фидбек по ответам Нэнси — 👍/👎 с привязкой к вопросу, ответу, модулю.
// Основа самообучения: накопленные 👎 анализируются для пополнения
// customInstructions и базы знаний. Следующий шаг: дайджест частых
// «не знаю» → дополнение базы → меньше 👎 по повторяющимся темам.
export const nancyFeedback = pgTable("nancy_feedback", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  rating:    text("rating").notNull(),          // 'up' | 'down'
  question:  text("question").notNull(),
  answer:    text("answer").notNull(),
  module:    text("module"),                    // hr | knowledge | learning | sales | …
  page:      text("page"),                      // /hr/vacancies, /hr/candidates, …
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// ─── Product Pricing (миграция 0217) ─────────────────────────────────────────
// Цена модуля внутри конкретного тарифного плана. Используется для расчёта
// стоимости набора модулей при назначении клиенту.

export const productPricing = pgTable("product_pricing", {
  id:            uuid("id").primaryKey().defaultRandom(),
  planId:        uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }).notNull(),
  moduleId:      uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  priceKopecks:  integer("price_kopecks").notNull().default(0),
  currency:      text("currency").notNull().default("RUB"),
  isActive:      boolean("is_active").notNull().default(true),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.planId, t.moduleId)])

export type ProductPricing = typeof productPricing.$inferSelect
export type NewProductPricing = typeof productPricing.$inferInsert

// ─── Bundle Discounts (миграция 0217) ────────────────────────────────────────
// Скидка за набор модулей: чем больше продуктов выбрал клиент, тем выше %.
// Применяется к общей сумме: total = subtotal × (1 − discountPercent / 100).

export const bundleDiscounts = pgTable("bundle_discounts", {
  id:              uuid("id").primaryKey().defaultRandom(),
  planId:          uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }).notNull(),
  minProducts:     integer("min_products").notNull(),
  maxProducts:     integer("max_products"),   // null = без верхней границы
  discountPercent: integer("discount_percent").notNull().default(0),
  description:     text("description"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.planId, t.minProducts)])

export type BundleDiscount = typeof bundleDiscounts.$inferSelect
export type NewBundleDiscount = typeof bundleDiscounts.$inferInsert

// ─── Platform Invite Links (миграция 0219) ────────────────────────────────────
// Платформенные ссылки-приглашения: регистрация под роль + вид партнёра.
// Отличаются от company-уровневых inviteLinks (строка 2021): нет companyId,
// поддерживают партнёрские kind, usedCount вместо usesCount, maxUses=0=безлимит.
// role — значение из CLIENT_ACCESS_TYPES или PARTNER_ACCESS_TYPES.
// kind — только для партнёрских ролей (partner/sub_partner/referral/sub_referral).

export const platformInviteLinks = pgTable("platform_invite_links", {
  id:         uuid("id").primaryKey().defaultRandom(),
  token:      text("token").unique().notNull(),
  role:       text("role").notNull(),
  kind:       text("kind"),
  label:      text("label"),
  maxUses:    integer("max_uses").notNull().default(0),
  usedCount:  integer("used_count").notNull().default(0),
  expiresAt:  timestamp("expires_at"),
  isActive:   boolean("is_active").notNull().default(true),
  createdBy:  uuid("created_by"),
  createdAt:  timestamp("created_at").defaultNow(),
})

export type PlatformInviteLink = typeof platformInviteLinks.$inferSelect
export type NewPlatformInviteLink = typeof platformInviteLinks.$inferInsert

// ─── Promo Codes (миграция 0219) ─────────────────────────────────────────────
// Платформенные промокоды для применения при регистрации (v2). Имя таблицы —
// platform_promo_codes, т.к. в БД уже есть orphan-таблица promo_codes
// (discount_percent/description, без Drizzle-схемы и без использования).
// kind: 'discount_percent' | 'trial_days' | 'plan'
// value: строка (например "20", "14", slug тарифа).
// maxUses = 0 → безлимит.

export const promoCodes = pgTable("platform_promo_codes", {
  id:         uuid("id").primaryKey().defaultRandom(),
  code:       text("code").unique().notNull(),
  kind:       text("kind").notNull(),
  value:      text("value").notNull(),
  maxUses:    integer("max_uses").notNull().default(0),
  usedCount:  integer("used_count").notNull().default(0),
  expiresAt:  timestamp("expires_at"),
  isActive:   boolean("is_active").notNull().default(true),
  createdAt:  timestamp("created_at").defaultNow(),
})

export type PromoCode = typeof promoCodes.$inferSelect
export type NewPromoCode = typeof promoCodes.$inferInsert

// ============================================================================
// Модуль «Проработка базы» (outreach) — единая база компаний по ИНН.
// Грузим разнородные xlsx (ГлобусВЭД / портал / ЕГРЮЛ / звонки) сколько угодно
// раз → дедуп по ИНН (без перезаписи, только ДОПОЛНЕНИЕ) → копим провенанс.
// Всё тенант-скоупится по companyId (компания-владелец на платформе).
// ============================================================================

export interface OutreachCompanyData { [k: string]: unknown }   // гибкий мешок доп-полей
export interface OutreachSourceRef {
  importId: string
  file: string
  sourceType: string   // globusved | portal | egrul | calls | unknown
  date: string         // ISO
}
export interface OutreachImportStats {
  total: number; created: number; merged: number; skipped: number; contacts: number
}

// Карточка целевой компании (лида). Дедуп: один ИНН = одна карточка на тенанта.
export const outreachCompanies = pgTable("outreach_companies", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  inn:         text("inn"),                                   // как в файле
  innNorm:     text("inn_norm"),                              // нормализованный (только цифры) — ключ слияния
  name:        text("name"),                                  // каноничное короткое имя
  fullName:    text("full_name"),
  region:      text("region"),
  address:     text("address"),
  website:     text("website"),
  okvedCode:   text("okved_code"),
  okvedName:   text("okved_name"),
  ogrn:        text("ogrn"),
  kpp:         text("kpp"),
  description: text("description"),                           // чем занимается (обогащение)
  segment:     text("segment"),                               // сегмент (ВЭД и т.п.)
  status:      text("status").notNull().default("new"),       // new|enriched|contacted|replied|won|lost
  enriched:    boolean("enriched").notNull().default(false),
  dataJson:    jsonb("data_json").$type<OutreachCompanyData>(),
  sourcesJson: jsonb("sources_json").$type<OutreachSourceRef[]>(),  // откуда пришли поля
  dedupKey:    text("dedup_key"),                             // для строк без ИНН: norm(name)+region
  deletedAt:   timestamp("deleted_at", { withTimezone: true }),  // корзина: NULL — активна, иначе в корзине
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  // Уникальность по (тенант, нормализованный ИНН). NULL-ИНН в PG считаются разными → строки без ИНН не конфликтуют.
  uniqueIndex("outreach_companies_company_inn_idx").on(t.companyId, t.innNorm),
  index("outreach_companies_company_idx").on(t.companyId),
  index("outreach_companies_dedup_idx").on(t.companyId, t.dedupKey),
  index("outreach_companies_status_idx").on(t.companyId, t.status),
  index("outreach_companies_deleted_idx").on(t.companyId, t.deletedAt),
])

// Контакты компании (много на одну): телефоны, почты, ЛПР, мессенджеры. Дедуп по (target, kind, value).
export const outreachContacts = pgTable("outreach_contacts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  companyId:  uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  targetId:   uuid("target_id").notNull().references(() => outreachCompanies.id, { onDelete: "cascade" }),
  kind:       text("kind").notNull(),                         // phone | email | person | whatsapp | telegram | site
  value:      text("value").notNull(),                        // нормализованное значение
  valueRaw:   text("value_raw"),                              // как было в файле
  personName: text("person_name"),                            // ФИО (если контактное лицо)
  position:   text("position"),                               // должность
  source:     text("source"),                                 // файл/источник
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("outreach_contacts_uniq_idx").on(t.targetId, t.kind, t.value),
  index("outreach_contacts_company_idx").on(t.companyId),
  index("outreach_contacts_target_idx").on(t.targetId),
])

// ВЭД-данные компании (ГлобусВЭД): что/откуда возит, объёмы.
export const outreachTrade = pgTable("outreach_trade", {
  id:            uuid("id").primaryKey().defaultRandom(),
  companyId:     uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  targetId:      uuid("target_id").notNull().references(() => outreachCompanies.id, { onDelete: "cascade" }),
  direction:     text("direction"),                           // import | export
  tnvedCodes:    jsonb("tnved_codes").$type<string[]>(),
  countries:     jsonb("countries").$type<string[]>(),
  suppliesCount: integer("supplies_count"),
  supplySumUsd:  doublePrecision("supply_sum_usd"),
  supplySumRub:  doublePrecision("supply_sum_rub"),
  weightNet:     doublePrecision("weight_net"),
  revenueRub:    doublePrecision("revenue_rub"),
  year:          integer("year"),
  source:        text("source"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("outreach_trade_company_idx").on(t.companyId),
  index("outreach_trade_target_idx").on(t.targetId),
])

// Журнал загрузок (провенанс батчей): сколько строк создано/слито/пропущено.
export const outreachImports = pgTable("outreach_imports", {
  id:            uuid("id").primaryKey().defaultRandom(),
  companyId:     uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  filename:      text("filename").notNull(),
  sourceType:    text("source_type").notNull().default("unknown"),  // globusved|portal|egrul|calls|unknown
  status:        text("status").notNull().default("done"),          // pending|done|error
  rowsTotal:     integer("rows_total").notNull().default(0),
  rowsCreated:   integer("rows_created").notNull().default(0),
  rowsMerged:    integer("rows_merged").notNull().default(0),
  rowsSkipped:   integer("rows_skipped").notNull().default(0),
  contactsAdded: integer("contacts_added").notNull().default(0),
  mappingJson:   jsonb("mapping_json"),                       // как колонки легли в поля
  error:         text("error"),
  createdBy:     uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("outreach_imports_company_idx").on(t.companyId),
])

export type OutreachCompany    = typeof outreachCompanies.$inferSelect
export type NewOutreachCompany = typeof outreachCompanies.$inferInsert
export type OutreachContact    = typeof outreachContacts.$inferSelect
export type NewOutreachContact = typeof outreachContacts.$inferInsert
export type OutreachTrade      = typeof outreachTrade.$inferSelect
export type NewOutreachTrade   = typeof outreachTrade.$inferInsert
export type OutreachImport     = typeof outreachImports.$inferSelect
export type NewOutreachImport  = typeof outreachImports.$inferInsert

// Подключение клиента к сервису рассылки — СВОЁ на каждую компанию (per-tenant).
// Имя провайдера в UI скрыто; здесь только ключ клиента + статус.
export interface OutreachIntegrationSettings { [k: string]: unknown }
export const outreachIntegrations = pgTable("outreach_integrations", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  apiKey:      text("api_key"),                              // ключ клиента к провайдеру (секрет)
  label:       text("label"),                               // нейтральная подпись подключения
  status:      text("status").notNull().default("disconnected"),  // connected | disconnected | error
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastError:   text("last_error"),
  settingsJson: jsonb("settings_json").$type<OutreachIntegrationSettings>(),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow(),
})
// Самообучающийся ПЛАТФОРМЕННЫЙ (глобальный, без company_id) справочник
// выученных имён кандидатов. Майнится cron'ом /api/cron/learn-given-names из
// hh_responses.raw_data по ВСЕЙ платформе: токен hh first_name, которого нет
// в статическом словаре (lib/messaging/russian-given-names.ts), но который
// встретился у ≥3 РАЗНЫХ кандидатов и не похож на фамилию (looksLikeSurname) —
// считается выученным. Чтение — lib/messaging/learned-given-names.ts
// (getLearnedNamesSet, кэш 10 мин). name_norm — ключ (lower-case).
export const learnedGivenNames = pgTable("learned_given_names", {
  nameNorm:    text("name_norm").primaryKey(),        // нормализованное (lower-case) — ключ сравнения
  displayName: text("display_name").notNull(),        // как встретилось чаще (с оригинальным регистром)
  occurrences: integer("occurrences").notNull().default(0),  // кол-во РАЗНЫХ кандидатов
  firstSeen:   timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen:    timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
})
export type LearnedGivenName    = typeof learnedGivenNames.$inferSelect
export type NewLearnedGivenName = typeof learnedGivenNames.$inferInsert

export type OutreachIntegration    = typeof outreachIntegrations.$inferSelect
export type NewOutreachIntegration = typeof outreachIntegrations.$inferInsert

// ─── Telegram-постинг (drizzle/0250) ───────────────────────────────────────
// Личный userbot-аккаунт владельца платформы (MTProto/GramJS) для постинга
// отложенных сообщений в Telegram-чаты/каналы (job-борды и маркетинг).
// Один активный ряд на пользователя (unique user_id). session_string хранится
// зашифрованным (lib/telegram-posting/crypto.ts, AES-256-GCM).

export const telegramUserbotSessions = pgTable("telegram_userbot_sessions", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phone:            text("phone"),
  sessionString:    text("session_string"),                   // зашифровано (iv:tag:ciphertext base64)
  phoneCodeHash:    text("phone_code_hash"),                  // временный, между шагами логина
  status:           text("status").notNull().default("pending_code"), // pending_code|pending_password|active|error
  lastError:        text("last_error"),
  dailyLimit:       integer("daily_limit").notNull().default(20),     // макс. отправок в сутки (анти-спам)
  lastConnectedAt:  timestamp("last_connected_at", { withTimezone: true }),
  dmWatchEnabled:   boolean("dm_watch_enabled").notNull().default(true),   // авто-атрибуция входящих ЛС (drizzle/0251)
  dmLastCheckedAt:  timestamp("dm_last_checked_at", { withTimezone: true }),
  chatsLastSyncedAt: timestamp("chats_last_synced_at", { withTimezone: true }), // авто-пересинк списка чатов (drizzle/0253)
  firstActivatedAt: timestamp("first_activated_at", { withTimezone: true }), // когда аккаунт ВПЕРВЫЕ стал active — для разгона лимита (drizzle/0254)
  peerFloodUntil:   timestamp("peer_flood_until", { withTimezone: true }),   // авто-пауза после сигнала PEER_FLOOD от Telegram (drizzle/0254)
  sendingPaused:    boolean("sending_paused").notNull().default(false),      // ручная аварийная пауза владельцем (drizzle/0254)
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("telegram_userbot_sessions_user_id_uq").on(t.userId),
])
export type TelegramUserbotSession    = typeof telegramUserbotSessions.$inferSelect
export type NewTelegramUserbotSession = typeof telegramUserbotSessions.$inferInsert

// Реестр диалогов Telegram (группы/каналы/личка), синкается из аккаунта владельца.
export const telegramPostingChats = pgTable("telegram_posting_chats", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tgPeerId:    text("tg_peer_id").notNull(),        // id диалога в Telegram
  accessHash:  text("access_hash"),
  title:       text("title").notNull(),
  type:        text("type").notNull(),               // 'group' | 'channel' | 'user'
  category:    text("category"),                      // 'job' | 'product' | NULL
  isEnabled:   boolean("is_enabled").notNull().default(true),
  costPerPost: numeric("cost_per_post", { precision: 10, scale: 2 }),  // ₽ за размещение (drizzle/0251)
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("telegram_posting_chats_user_peer_uq").on(t.userId, t.tgPeerId),
])
export type TelegramPostingChat    = typeof telegramPostingChats.$inferSelect
export type NewTelegramPostingChat = typeof telegramPostingChats.$inferInsert

// Отложенные посты — очередь сообщений в Telegram с расписанием и повтором.
export const telegramScheduledPosts = pgTable("telegram_scheduled_posts", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category:      text("category").notNull(),          // 'vacancy' | 'product' — раздел создания
  title:         text("title").notNull(),              // внутреннее имя для списка
  body:          text("body").notNull(),                // текст поста (plain text, переводы строк сохраняются)
  imagePath:     text("image_path"),                     // путь загруженной картинки (/uploads/...)
  chatIds:       jsonb("chat_ids").notNull(),             // массив id из telegram_posting_chats
  linkUrl:       text("link_url"),                        // куда вести трекинг-ссылку /go/{code} (drizzle/0251)
  staggerMinutes: integer("stagger_minutes").notNull().default(0), // разнос отправки по чатам, мин.; 0=все сразу (drizzle/0251)
  scheduledAt:   timestamp("scheduled_at", { withTimezone: true }).notNull(),
  repeatRule:    text("repeat_rule").notNull().default("none"), // 'none' | 'daily' | 'weekly'
  status:        text("status").notNull().default("scheduled"), // scheduled|sending|sent|error|paused
  lastError:     text("last_error"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("telegram_scheduled_posts_user_status_idx").on(t.userId, t.status),
  index("telegram_scheduled_posts_scheduled_at_idx").on(t.scheduledAt),
])
export type TelegramScheduledPost    = typeof telegramScheduledPosts.$inferSelect
export type NewTelegramScheduledPost = typeof telegramScheduledPosts.$inferInsert

// Лог доставок — одна строка на попытку отправки поста в конкретный чат.
export const telegramPostDeliveries = pgTable("telegram_post_deliveries", {
  id:            uuid("id").primaryKey().defaultRandom(),
  postId:        uuid("post_id").notNull().references(() => telegramScheduledPosts.id, { onDelete: "cascade" }),
  chatId:        uuid("chat_id").notNull().references(() => telegramPostingChats.id, { onDelete: "cascade" }),
  sentAt:        timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  status:        text("status").notNull(),          // 'sent' | 'failed'
  error:         text("error"),
  tgMessageId:   text("tg_message_id"),
}, (t) => [
  index("telegram_post_deliveries_post_id_idx").on(t.postId),
  index("telegram_post_deliveries_chat_id_idx").on(t.chatId),
])
export type TelegramPostDelivery    = typeof telegramPostDeliveries.$inferSelect
export type NewTelegramPostDelivery = typeof telegramPostDeliveries.$inferInsert

// ─── Telegram-атрибуция (drizzle/0251) ─────────────────────────────────────
// Три слоя: (1) трекинг-ссылки в постах, (2) авто-атрибуция входящих ЛС через
// userbot, (3) сводка по каналам с расходами (см. lib/telegram-posting/analytics.ts).

// Уникальная трекинг-ссылка на конкретный чат в рамках поста. code — 8 симв.
// base62 (lib/telegram-posting/link-code.ts), редирект /go/{code} инкрементит clicks.
export const telegramPostLinks = pgTable("telegram_post_links", {
  id:         uuid("id").primaryKey().defaultRandom(),
  postId:     uuid("post_id").notNull().references(() => telegramScheduledPosts.id, { onDelete: "cascade" }),
  chatId:     uuid("chat_id").notNull().references(() => telegramPostingChats.id, { onDelete: "cascade" }),
  code:       text("code").notNull(),
  targetUrl:  text("target_url").notNull(),
  clicks:     integer("clicks").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("telegram_post_links_code_uq").on(t.code),
  unique("telegram_post_links_post_chat_uq").on(t.postId, t.chatId),
])
export type TelegramPostLink    = typeof telegramPostLinks.$inferSelect
export type NewTelegramPostLink = typeof telegramPostLinks.$inferInsert

// Лог кликов по трекинг-ссылкам. Сырой IP не храним — только sha256(ip+соль).
export const telegramLinkClicks = pgTable("telegram_link_clicks", {
  id:         uuid("id").primaryKey().defaultRandom(),
  linkId:     uuid("link_id").notNull().references(() => telegramPostLinks.id, { onDelete: "cascade" }),
  clickedAt:  timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
  userAgent:  text("user_agent"),
  ipHash:     text("ip_hash"),
}, (t) => [
  index("telegram_link_clicks_link_id_idx").on(t.linkId),
])
export type TelegramLinkClick    = typeof telegramLinkClicks.$inferSelect
export type NewTelegramLinkClick = typeof telegramLinkClicks.$inferInsert

// Лиды из входящих ЛС (кто-то написал владельцу лично после того, как увидел
// пост в чате). source_confidence: 'common_chat' | 'keyword' | 'ambiguous' |
// 'timing' | 'manual'. candidate_chat_ids заполняется ТОЛЬКО когда общих чатов
// с лидом несколько и не удалось однозначно выбрать — sourceChatId тогда лишь
// предположение (самый недавний из кандидатов), а UI честно помечает "уточните".
export const telegramDmLeads = pgTable("telegram_dm_leads", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tgUserId:           text("tg_user_id").notNull(),
  tgUsername:         text("tg_username"),
  displayName:        text("display_name"),
  firstMessageAt:     timestamp("first_message_at", { withTimezone: true }).notNull(),
  firstMessageText:   text("first_message_text"),
  sourceChatId:       uuid("source_chat_id").references(() => telegramPostingChats.id, { onDelete: "set null" }),
  sourceConfidence:   text("source_confidence"), // 'common_chat' | 'keyword' | 'ambiguous' | 'timing' | 'manual'
  candidateChatIds:   jsonb("candidate_chat_ids"), // string[] чатов-кандидатов, если source_confidence='ambiguous'
  notes:              text("notes"),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("telegram_dm_leads_user_tg_uq").on(t.userId, t.tgUserId),
])
export type TelegramDmLead    = typeof telegramDmLeads.$inferSelect
export type NewTelegramDmLead = typeof telegramDmLeads.$inferInsert

// ─── Персональные данные / 152-ФЗ (drizzle/0255) ───────────────────────────
// 152-ФЗ: журнал согласий на обработку персональных данных / cookie / рекламные
// рассылки. Пишется публичным POST /api/consent (баннер cookie, чекбоксы
// регистрации/подписки). userId — если посетитель уже авторизован, иначе null
// (анонимный посетитель — идентифицируется visitorId, UUID в localStorage/cookie).
// documentVersion — дата редакции текста документа на момент согласия (см.
// PRIVACY_POLICY_VERSION и др. константы версий на самих страницах), чтобы
// при будущих правках текста можно было доказать, на какую именно редакцию
// было дано согласие. details — свободный jsonb (напр. выбранные категории
// cookie: {analytics: true, marketing: false}).
// ГРАНИЦА (0275): сюда пишутся ТОЛЬКО согласия, данные Company24.pro как
// оператору ПД (регистрация, партнёрка, лиды лендинга/портфолио). Согласия
// кандидатов из анкеты демо — другая связка (оператор = компания-наниматель),
// они живут per-tenant в candidates.consent_at и в этот журнал/счётчик
// /admin/platform → «Согласия» попадать не должны.
export const consentLog = pgTable("consent_log", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  visitorId:       text("visitor_id"),                 // анонимный id (cookie/localStorage), если userId нет
  consentType:     text("consent_type").notNull(),     // 'cookie' | 'privacy_policy' | 'marketing'
  action:          text("action").notNull(),           // 'accepted' | 'rejected' | 'partial'
  documentVersion: text("document_version").notNull(), // дата редакции текста, напр. "2026-07-04"
  details:         jsonb("details"),                    // напр. {analytics:true, marketing:false}
  ipAddress:       text("ip_address"),
  userAgent:       text("user_agent"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("consent_log_created_idx").on(t.createdAt),
  index("consent_log_user_idx").on(t.userId),
  index("consent_log_visitor_idx").on(t.visitorId),
  index("consent_log_type_idx").on(t.consentType),
])
export type ConsentLog    = typeof consentLog.$inferSelect
export type NewConsentLog = typeof consentLog.$inferInsert

// ─── Мониторинг цен / price_monitor (drizzle/0256) ─────────────────────────
// Модуль сравнения цен наших объектов размещения с конкурентами поблизости.
// Первый источник — Airbnb (lib/price-monitor/sources/airbnb.ts), архитектура
// адаптеров рассчитана на добавление Суточно/Авито/Островок без переделки ядра.
// Никакого хардкода порогов/периодов/расписаний — все настройки на уровне
// платформа → компания (price_monitor_settings) → объект (settings_json),
// эффективные значения собираются в run-monitor.ts.

// Настройки конкретного объекта — переопределяют company-level дефолты
// (price_monitor_settings). Все поля опциональные: отсутствующее поле →
// берём значение компании.
export interface PriceMonitorObjectSettings {
  radiusM?: number
  periods?: number[]                 // напр. [7, 14, 28, 30] — периоды проживания (ночей)
  leadDays?: number                  // за сколько дней вперёд заезд при срезе цен (дефолт 1)
  complexFilter?: string             // фильтр по названию ЖК для авто-поиска конкурентов
  schedule?: {
    intervalMinutes?: number | null  // интервал между прогонами; null = только по runAtTime
    runAtTime?: string | null        // "HH:MM" — время суток прогона; null = без привязки ко времени
  }
  autoDiscover?: boolean             // авто-поиск конкурентов в радиусе
}

// Наши объекты размещения, за которыми следим.
export const priceMonitorObjects = pgTable("price_monitor_objects", {
  id:             uuid("id").primaryKey().defaultRandom(),
  companyId:      uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),
  source:         text("source").notNull().default("airbnb"), // 'airbnb' | 'sutochno' | 'avito' | 'ostrovok' (в будущем)
  externalId:     text("external_id").notNull(),
  url:            text("url"),
  lat:            doublePrecision("lat"),
  lng:            doublePrecision("lng"),
  address:        text("address"),
  complexName:    text("complex_name"),   // ЖК
  isActive:       boolean("is_active").notNull().default(true),
  settingsJson:   jsonb("settings_json").$type<PriceMonitorObjectSettings>().notNull().default({}),
  lastCheckedAt:  timestamp("last_checked_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("price_monitor_objects_company_idx").on(t.companyId),
  index("price_monitor_objects_active_idx").on(t.isActive),
])
export type PriceMonitorObject    = typeof priceMonitorObjects.$inferSelect
export type NewPriceMonitorObject = typeof priceMonitorObjects.$inferInsert

// Конкуренты рядом с объектом — найдены автоматически (радиус+ЖК-фильтр) или
// добавлены вручную HR/владельцем.
export const priceMonitorCompetitors = pgTable("price_monitor_competitors", {
  id:            uuid("id").primaryKey().defaultRandom(),
  objectId:      uuid("object_id").notNull().references(() => priceMonitorObjects.id, { onDelete: "cascade" }),
  source:        text("source").notNull().default("airbnb"),
  externalId:    text("external_id").notNull(),
  url:           text("url"),
  name:          text("name"),
  lat:           doublePrecision("lat"),
  lng:           doublePrecision("lng"),
  distanceM:     integer("distance_m"),
  complexName:   text("complex_name"),
  discovered:    text("discovered").notNull().default("auto"), // 'auto' | 'manual'
  isIgnored:     boolean("is_ignored").notNull().default(false),
  firstSeenAt:   timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:    timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("price_monitor_competitors_object_source_ext_uq").on(t.objectId, t.source, t.externalId),
  index("price_monitor_competitors_object_idx").on(t.objectId),
])
export type PriceMonitorCompetitor    = typeof priceMonitorCompetitors.$inferSelect
export type NewPriceMonitorCompetitor = typeof priceMonitorCompetitors.$inferInsert

// Срезы цен — и нашего объекта (competitorId = NULL), и конкурентов, по
// периодам проживания (7/14/28/30 ночей и т.д., настраивается).
export const priceMonitorSnapshots = pgTable("price_monitor_snapshots", {
  id:            uuid("id").primaryKey().defaultRandom(),
  objectId:      uuid("object_id").notNull().references(() => priceMonitorObjects.id, { onDelete: "cascade" }),
  competitorId:  uuid("competitor_id").references(() => priceMonitorCompetitors.id, { onDelete: "cascade" }), // NULL = наш объект
  periodNights:  integer("period_nights").notNull(),
  checkinDate:   date("checkin_date").notNull(),
  checkoutDate:  date("checkout_date").notNull(),
  priceTotal:    numeric("price_total"),
  pricePerNight: numeric("price_per_night"),
  currency:      text("currency").notNull().default("RUB"),
  available:     boolean("available").notNull().default(true),
  rawJson:       jsonb("raw_json"),
  capturedAt:    timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("price_monitor_snapshots_object_captured_idx").on(t.objectId, t.capturedAt),
  index("price_monitor_snapshots_competitor_captured_idx").on(t.competitorId, t.capturedAt),
])
export type PriceMonitorSnapshot    = typeof priceMonitorSnapshots.$inferSelect
export type NewPriceMonitorSnapshot = typeof priceMonitorSnapshots.$inferInsert

// Company-level дефолты мониторинга — эффективные настройки объекта = эти
// значения, переопределённые непустыми полями PriceMonitorObjectSettings.
export const priceMonitorSettings = pgTable("price_monitor_settings", {
  companyId:       uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  radiusM:         integer("radius_m").notNull().default(1000),
  periods:         integer("periods").array().notNull().default([7, 14, 28, 30]),
  intervalMinutes: integer("interval_minutes").notNull().default(1440),
  runAtTime:       text("run_at_time").notNull().default("06:00"),
  currency:        text("currency").notNull().default("RUB"),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
export type PriceMonitorSettings    = typeof priceMonitorSettings.$inferSelect
export type NewPriceMonitorSettings = typeof priceMonitorSettings.$inferInsert

// ─── Сторож найма (drizzle/0260) ───────────────────────────────────────────
// Платформенный крон /api/cron/hiring-watchdog периодически проверяет, что по
// вакансиям компаний всё работает (hh-токен, импорт откликов, разбор очереди,
// отправки, кроны, AI-скоринг). Что может — чинит сам (см. lib/hiring-watchdog/*),
// что не может — пишет сюда алерт: CRITICAL летит в Telegram немедленно,
// warning только в UI (баннер components/dashboard/admin-alerts-banner.tsx).
//
// companyId=NULL — платформенный алерт (например, «крон не бежал N минут»),
// виден только platform_admin. company-level алерт виден директору компании.
//
// dedupKey — стабильный ключ инцидента (напр. "hh_token_dead:<companyId>"):
// пока открытый алерт с таким ключом существует, повторные прогоны крона НЕ
// создают дубли — только обновляют существующую строку при желании (сейчас —
// просто скип, апдейт message не требуется по ТЗ). Когда проблема исчезает —
// крон сам переводит алерт в resolved (autoResolved=true).
export const adminAlerts = pgTable("admin_alerts", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").references(() => companies.id, { onDelete: "cascade" }), // NULL = платформенный
  severity:    text("severity").notNull(), // 'critical' | 'warning' | 'info'
  source:      text("source").notNull(), // напр. 'hiring_watchdog'
  dedupKey:    text("dedup_key").notNull(),
  title:       text("title").notNull(),
  message:     text("message").notNull(),
  actionUrl:   text("action_url"), // куда вести админа (кнопка «Перейти»)
  status:      text("status").notNull().default("open"), // 'open' | 'acked' | 'resolved'
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  ackedAt:     timestamp("acked_at", { withTimezone: true }),
  ackedBy:     uuid("acked_by").references(() => users.id),
  resolvedAt:  timestamp("resolved_at", { withTimezone: true }),
  autoResolved: boolean("auto_resolved").notNull().default(false),
}, (t) => [
  // Один открытый алерт на инцидент — повторные прогоны крона видят
  // существующую строку и не плодят дубли. Partial index (только status='open')
  // намеренно: после resolve тот же dedup_key может открыться заново позже.
  uniqueIndex("admin_alerts_open_dedup_idx").on(t.dedupKey).where(sql`${t.status} = 'open'`),
  index("admin_alerts_company_status_idx").on(t.companyId, t.status),
  index("admin_alerts_created_idx").on(t.createdAt),
])
export type AdminAlert    = typeof adminAlerts.$inferSelect
export type NewAdminAlert = typeof adminAlerts.$inferInsert

// ─── Типология (модуль «tip») ────────────────────────────────────────────────
// AI-разбор личности по дате рождения. /tip + телеграм-бот (позже).
// Пользователь модуля НЕ обязательно совпадает с users платформы — это
// отдельная сущность (аноним по tg_chat_id, либо email для веба).

export interface TipUserPrefs {
  depth?: "short" | "detailed" | "full"
  audience?: "self" | "send_to_person" | "hiring_analysis"
  gender?: string
  name?: string
  birthDate?: string  // ДД.ММ.ГГГГ — для предзаполнения формы
  lastRunAt?: string  // ISO
}

export const tipUsers = pgTable("tip_users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tgChatId:     bigint("tg_chat_id", { mode: "number" }).unique(),
  email:        text("email"),
  displayName:  text("display_name"),
  balanceRuns:  integer("balance_runs").notNull().default(0),
  prefsJson:    jsonb("prefs_json").$type<TipUserPrefs>(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Виральность (0261): реферальный код владельца + кто пригласил.
  refCode:      text("ref_code").unique(),
  referredBy:   uuid("referred_by").references((): any => tipUsers.id),
  // Антифрод (0263): хэш IP при создании (sha256(ip + NEXTAUTH_SECRET)) —
  // ловим фарм рефералов через инкогнито/разные cookie с одного устройства.
  // Для бот-пользователей (lib/tip/bot/users.ts) — null, IP недоступен.
  ipHash:       text("ip_hash"),
}, (t) => [
  index("tip_users_ip_hash_idx").on(t.ipHash),
])
export type TipUser    = typeof tipUsers.$inferSelect
export type NewTipUser = typeof tipUsers.$inferInsert

// Входные данные разбора — собраны на UI, формула считается кодом (НЕ AI).
// Совпадает по смыслу с TipRequestInput (lib/tip/prompt.ts), но контекст
// хранится как список (contexts) — при нескольких выбранных пользователем
// контекстах (раздел 7 методики) вызывающий код объединяет их в один прогон.
export interface TipRunInput {
  name?: string
  birthDate: string          // ДД.ММ.ГГГГ
  gender?: string
  contexts: string[]         // слаги из lib/tip/contexts.ts, напр. ["entrepreneur"]
  role?: string              // должность — для employee/manager
  extraQuestion?: string
  depth: "short" | "detailed" | "full"
  audience: "self" | "send_to_person" | "hiring_analysis"
  secondPerson?: {           // для парных контекстов (партнёрство/отношения)
    name?: string
    birthDate?: string
    gender?: string
  }
}

// Реальная форма формулы — считается в lib/tip/calculation.ts (computeFormula),
// НЕ переизобретаем здесь: хранится как есть, включая оттенки/повторы/пропуски.
export type TipFormula = TipCalcFormula

// Виральность (0261): короткие цитаты/сильные стороны разбора — для OG-превью
// и «зацепок» в расшаренной странице. Заполняет AI-слой генерации (не эта зона).
export interface TipRunHighlights {
  quotes: string[]
  strengths: string[]
}

export const tipRuns = pgTable("tip_runs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => tipUsers.id, { onDelete: "cascade" }),
  inputJson:    jsonb("input_json").$type<TipRunInput>().notNull(),
  formulaJson:  jsonb("formula_json").$type<TipFormula>(),
  status:       text("status").notNull().default("pending"), // pending|generating|done|error
  resultMd:     text("result_md"),
  errorText:    text("error_text"),
  model:        text("model"),
  tokensIn:     integer("tokens_in"),
  tokensOut:    integer("tokens_out"),
  costUsd:      numeric("cost_usd", { precision: 10, scale: 6 }),
  shareToken:   text("share_token").unique(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt:   timestamp("finished_at", { withTimezone: true }),
  // Виральность (0261): цитаты для OG + денорм-счётчик просмотров шаринга.
  highlightsJson: jsonb("highlights_json").$type<TipRunHighlights>(),
  viewsCount:     integer("views_count").notNull().default(0),
}, (t) => [
  index("tip_runs_user_idx").on(t.userId),
  index("tip_runs_share_token_idx").on(t.shareToken),
])
export type TipRun    = typeof tipRuns.$inferSelect
export type NewTipRun = typeof tipRuns.$inferInsert

// Редактируемые слои промптов методики — НИКАКОГО зашитого в код контента.
// layer_key: base | shades | context:<slug> | style:<audience> | depth:<depth> | age_gate
export const tipPromptLayers = pgTable("tip_prompt_layers", {
  id:         uuid("id").primaryKey().defaultRandom(),
  layerKey:   text("layer_key").notNull().unique(),
  title:      text("title").notNull(),
  content:    text("content").notNull(),
  isActive:   boolean("is_active").notNull().default(true),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
export type TipPromptLayer    = typeof tipPromptLayers.$inferSelect
export type NewTipPromptLayer = typeof tipPromptLayers.$inferInsert

// Промокоды на прогоны (в т.ч. бесплатные ссылки — is_free_link).
//
// Личные коды-пропуска (0265): is_personal=true + owner_user_id — код,
// который "логинит" браузер в конкретный аккаунт (см. lib/tip/service.ts::
// activatePromo, ветка is_personal, и lib/tip/session.ts::switchTipUserCookie).
// Активация личного кода НЕ начисляет прогоны и НЕ пишет tip_promo_activations
// (его можно вводить сколько угодно раз) — вместо этого cookie tip_uid
// переключается на owner_user_id.
export const tipPromoCodes = pgTable("tip_promo_codes", {
  id:                uuid("id").primaryKey().defaultRandom(),
  code:              text("code").notNull().unique(),
  runsGranted:       integer("runs_granted").notNull(),
  maxActivations:    integer("max_activations"),  // null = без лимита
  activationsCount:  integer("activations_count").notNull().default(0),
  isFreeLink:        boolean("is_free_link").notNull().default(false),
  sourceLabel:       text("source_label"),
  expiresAt:         timestamp("expires_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  isPersonal:        boolean("is_personal").notNull().default(false),
  ownerUserId:       uuid("owner_user_id").references(() => tipUsers.id),
})
export type TipPromoCode    = typeof tipPromoCodes.$inferSelect
export type NewTipPromoCode = typeof tipPromoCodes.$inferInsert

export const tipPromoActivations = pgTable("tip_promo_activations", {
  id:         uuid("id").primaryKey().defaultRandom(),
  promoId:    uuid("promo_id").notNull().references(() => tipPromoCodes.id, { onDelete: "cascade" }),
  userId:     uuid("user_id").notNull().references(() => tipUsers.id, { onDelete: "cascade" }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("tip_promo_activations_promo_user_uq").on(t.promoId, t.userId),
  index("tip_promo_activations_promo_idx").on(t.promoId),
])
export type TipPromoActivation    = typeof tipPromoActivations.$inferSelect
export type NewTipPromoActivation = typeof tipPromoActivations.$inferInsert

// Заготовка оплаты — оплата отключена на старте (провайдер не подключён).
export const tipPayments = pgTable("tip_payments", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => tipUsers.id, { onDelete: "cascade" }),
  amountRub:    integer("amount_rub").notNull(),
  runsGranted:  integer("runs_granted").notNull(),
  provider:     text("provider"),
  externalId:   text("external_id"),
  status:       text("status").notNull().default("created"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
export type TipPayment    = typeof tipPayments.$inferSelect
export type NewTipPayment = typeof tipPayments.$inferInsert

// Доп. вопросы к уже готовому разбору (уточнения без нового полного прогона).
export const tipQuestions = pgTable("tip_questions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  runId:      uuid("run_id").notNull().references(() => tipRuns.id, { onDelete: "cascade" }),
  question:   text("question").notNull(),
  answerMd:   text("answer_md"),
  status:     text("status").notNull().default("pending"),
  tokensIn:   integer("tokens_in"),
  tokensOut:  integer("tokens_out"),
  costUsd:    numeric("cost_usd", { precision: 10, scale: 6 }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
export type TipQuestion    = typeof tipQuestions.$inferSelect
export type NewTipQuestion = typeof tipQuestions.$inferInsert

// Состояние мастера диалога Telegram-бота «Типология» (lib/tip/bot/**,
// миграция 0262). Отдельно от tipUsers — эфемерный черновик текущего шага
// (дата/имя/пол/контекст/...), НЕ профиль пользователя. data_json также
// хранит lastUpdateId для dedupe повторных Telegram-апдейтов.
export interface TipTgSessionData {
  lastUpdateId?: number
  draft?: {
    name?: string
    gender?: string
    birthDate?: string
    context?: string
    role?: string
    depth?: string
    audience?: string
    question?: string
    pairMode?: boolean
    second?: { name?: string; birthDate?: string }
    promptedContextGroup?: "main" | "more"
  }
  shortMessagesCount?: number
}

export const tipTgSessions = pgTable("tip_tg_sessions", {
  chatId:     bigint("chat_id", { mode: "number" }).primaryKey(),
  state:      text("state").notNull().default("idle"),
  dataJson:   jsonb("data_json").$type<TipTgSessionData>(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
export type TipTgSession    = typeof tipTgSessions.$inferSelect
export type NewTipTgSession = typeof tipTgSessions.$inferInsert

// ─── Типология: виральность (аналитика чтения + рефералка, 0261) ──────────
// Просмотры расшаренного разбора (кто/сколько смотрел), реферальные цепочки
// приглашений и платформенные настройки модуля (пороги уведомлений, размеры
// бонусов) — редактируемые, НЕ зашитые в код (tip_settings.value_json).

export const tipShareViews = pgTable("tip_share_views", {
  id:              uuid("id").primaryKey().defaultRandom(),
  runId:           uuid("run_id").notNull().references(() => tipRuns.id, { onDelete: "cascade" }),
  viewerUid:       uuid("viewer_uid").notNull(),
  source:          text("source"), // 'tg' | 'wa' | 'direct' | ...
  secondsVisible:  integer("seconds_visible").notNull().default(0),
  maxScrollPct:    integer("max_scroll_pct").notNull().default(0),
  firstAt:         timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
  lastAt:          timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("tip_share_views_run_viewer_uq").on(t.runId, t.viewerUid),
  index("tip_share_views_run_idx").on(t.runId),
])
export type TipShareView    = typeof tipShareViews.$inferSelect
export type NewTipShareView = typeof tipShareViews.$inferInsert

export const tipReferrals = pgTable("tip_referrals", {
  id:              uuid("id").primaryKey().defaultRandom(),
  referrerUserId:  uuid("referrer_user_id").notNull().references(() => tipUsers.id, { onDelete: "cascade" }),
  referredUserId:  uuid("referred_user_id").notNull().unique().references(() => tipUsers.id, { onDelete: "cascade" }),
  status:          text("status").notNull().default("pending"), // pending|activated
  bonusGrantedAt:  timestamp("bonus_granted_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Антифрод (0263): когда начислены welcome-прогоны приглашённому — используется
  // для капа «не больше 2 welcome-начислений на один ip_hash за 30 дней».
  welcomeGrantedAt: timestamp("welcome_granted_at", { withTimezone: true }),
})
export type TipReferral    = typeof tipReferrals.$inferSelect
export type NewTipReferral = typeof tipReferrals.$inferInsert

// key: referral_welcome_runs | referral_bonus_runs | referral_monthly_cap |
// view_notify_thresholds (jsonb-массив чисел, напр. [1,5,10,25,50,100]).
export const tipSettings = pgTable("tip_settings", {
  key:        text("key").primaryKey(),
  valueJson:  jsonb("value_json").notNull(),
})
export type TipSetting    = typeof tipSettings.$inferSelect
export type NewTipSetting = typeof tipSettings.$inferInsert

// ─── Заявки с публичного лендинга (0266) ───────────────────────────────────
// Лендинг не предлагает self-service регистрацию — реальное предложение:
// заказать демонстрацию платформы или консультацию. Форма #request на
// /landing пишет сюда, POST /api/public/landing-lead шлёт Telegram-алерт
// владельцу платформы (message_guard_alerts, тот же helper, что у стража).
export const landingLeads = pgTable("landing_leads", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  contact:   text("contact").notNull(), // телефон/telegram/email — как ввёл сам
  company:   text("company"),
  interest:  text("interest").notNull().default("demo"), // 'demo' | 'consultation' | 'website'
  comment:   text("comment"),
  source:    text("source"), // utm/referrer, опционально
  ipHash:    text("ip_hash"), // sha256(ip + NEXTAUTH_SECRET), антиспам — не сам IP
  status:    text("status").notNull().default("new"), // 'new' | 'contacted' | 'closed'
  consentAt: timestamp("consent_at", { withTimezone: true }), // 152-ФЗ: когда дал согласие на обработку ПД (0268)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("landing_leads_created_idx").on(t.createdAt),
  index("landing_leads_status_idx").on(t.status),
])
export type LandingLead    = typeof landingLeads.$inferSelect
export type NewLandingLead = typeof landingLeads.$inferInsert

// ─── Витрина клиентских страниц: аналитика просмотров (0267) ──────────────
// Просмотры страниц newsite.company24.pro/<slug> по отправленной клиенту
// ссылке. Накопительный upsert по визиту (slug+path+visitor_id): время и
// глубина прокрутки копятся по тикам инлайн-трекера (client-pages-tracking.ts).
export const clientPageViews = pgTable("client_page_views", {
  id:             uuid("id").primaryKey().defaultRandom(),
  slug:           text("slug").notNull(),
  path:           text("path").notNull(),
  visitorId:      text("visitor_id").notNull(),
  recipient:      text("recipient"),
  source:         text("source"),
  referrer:       text("referrer"),
  userAgent:      text("user_agent"),
  screen:         text("screen"),
  ipHash:         text("ip_hash"),
  secondsVisible: integer("seconds_visible").notNull().default(0),
  maxScrollPct:   integer("max_scroll_pct").notNull().default(0),
  firstAt:        timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
  lastAt:         timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("client_page_views_uq").on(t.slug, t.path, t.visitorId),
  index("client_page_views_slug_idx").on(t.slug),
  index("client_page_views_slug_visitor_idx").on(t.slug, t.visitorId),
  index("client_page_views_last_idx").on(t.lastAt),
])
export type ClientPageView    = typeof clientPageViews.$inferSelect
export type NewClientPageView = typeof clientPageViews.$inferInsert

// ─── Big Life: архив обложек (0270, компанийский, 0271) ────────────────────
// Управляет данными статической страницы "Big Life Covers.dc.html" на
// biglife.company24.pro — сайт-витрина (poddomain-root, чистый nginx-статик,
// НЕ часть Next.js). Публикация из /big-life/covers пишет строки этой таблицы
// в HTML-файл напрямую на диск сервера (см. lib/big-life/render-covers-page.ts
// + lib/big-life/paths.ts), т.к. и my-komanda, и статика Big Life живут на
// одной машине. companyId — Big Life заведён как полноценный тенант (0271):
// доступ через обычный requireCompany()/requireDirector() + проверку
// companyId === BIGLIFE_COMPANY_ID (см. lib/big-life/auth.ts), а не через
// requirePlatformOperator() как было изначально.
export const bigLifeCovers = pgTable("big_life_covers", {
  id:         uuid("id").primaryKey().defaultRandom(),
  companyId:  uuid("company_id").notNull().references(() => companies.id),
  title:      text("title").notNull(),        // напр. "BIG life март-апрель 2026"
  heading:    text("heading").notNull(),       // подпись на карточке — обычно имя героя
  period:     text("period"),                  // напр. "Март-апрель 2026" (может быть null)
  year:       text("year").notNull(),
  imagePath:  text("image_path"),              // относительный путь от корня biglife (assets/covers-archive/...)
  price:      integer("price"),                // ₽, null = цена не указана
  salePrice:  integer("sale_price"),           // ₽ со скидкой, null = скидки нет
  stockQty:   integer("stock_qty"),            // null = не отслеживаем остаток
  soldOut:    boolean("sold_out").notNull().default(false), // ручной оверрайд "нет в наличии"
  isActive:   boolean("is_active").notNull().default(true), // false = скрыт с публичной страницы
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("big_life_covers_year_idx").on(t.year),
  index("big_life_covers_sort_idx").on(t.sortOrder),
  index("big_life_covers_company_idx").on(t.companyId),
])
export type BigLifeCover    = typeof bigLifeCovers.$inferSelect
export type NewBigLifeCover = typeof bigLifeCovers.$inferInsert
