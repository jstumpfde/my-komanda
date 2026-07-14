// «Карта настроек» — единый источник правды по всем настраиваемым параметрам
// HR-контура: человекочитаемое название, где хранится эффективное значение,
// и куда вести редактировать. Данные СЕРИАЛИЗУЕМЫ (никаких функций внутри
// resolve) — резолвинг эффективного значения делает сервер (см.
// app/api/modules/hr/settings-map/route.ts) по kind+path.
//
// level:
//   "platform" — платформенный дефолт (правит platform_admin в /admin),
//   "company"  — можно переопределить на уровне компании (HR → Настройки HR),
//   "vacancy"  — можно переопределить на уровне конкретной вакансии.
//
// resolve.kind:
//   "companyHiringDefaults" — путь внутри companies.hiring_defaults_json
//                              (для чисто company-level настроек без
//                              платформенного/vacancy-уровня).
//   "effectiveMessage"      — цепочка платформа→компания→вакансия для текстов
//                              сообщений (getEffectiveMessageDefaults + оверрайд
//                              на вакансии). path — ключ MessageDefaults.
//   "platformSetting"       — платформенная KV-запись (platform_settings.key).
//   "spec"                  — vacancy_specs.spec (через getSpec, Zod-бэкфилл).
//                              Требует vacancyId, иначе level=vacancy default.
//   "vacancy"               — прямая колонка/JSON-путь в vacancies (требует
//                              vacancyId).
//   "companyColumn"         — прямая колонка companies (не JSON).
//   "demoSettings"          — demos.post_demo_settings, path = "<kind>:<field>"
//                              (kind = 'demo' | 'test'; требует vacancyId).
//   "code"                  — не хранится в БД, значение зашито в код
//                              (используется вместе с hardcoded:true).
import { DEFAULT_REJECT_LETTER } from "@/lib/core/spec/types"

export type SettingsResolveKind =
  | "companyHiringDefaults"
  | "effectiveMessage"
  | "platformSetting"
  | "spec"
  | "vacancy"
  | "companyColumn"
  | "demoSettings"
  | "code"

export interface SettingsResolve {
  kind: SettingsResolveKind
  /** Dot-путь внутри JSON (или "<demoKind>:<field>" для demoSettings, или имя
   *  ключа platform_settings/effectiveMessage). Пусто для kind="code". */
  path?: string
  /** Дефолт кода — показывается, если запись в БД пуста/отсутствует. */
  default?: unknown
}

export interface SettingsRegistryEntry {
  key: string
  title: string
  description?: string
  group: string
  level: "platform" | "company" | "vacancy"
  /** Куда вести «редактировать». null — редактирования в UI пока нет. */
  editPath: string | null
  resolve: SettingsResolve
  /** true — параметр пока живёт в коде (жёлтый бейдж «в коде»). */
  hardcoded?: true
  /** Статичный текст значения для hardcoded-записей (не читаем из БД). */
  codeValue?: string
  /** true — запись мертва (UI/поле удалено из продукта), держим в реестре
   *  ТОЛЬКО для истории/аудита (аддитивность — строки не удаляем). Резолвер
   *  карты настроек продолжает её показывать; UI решает, скрывать/помечать. */
  deprecated?: true
}

export const SETTINGS_REGISTRY: SettingsRegistryEntry[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Сообщения кандидатам
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "msg.invite",
    title: "Первое сообщение (рабочее время)",
    description: "Уходит кандидату при авто-приглашении в рабочее время вакансии.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "effectiveMessage", path: "inviteMessage" },
  },
  {
    key: "msg.offHours",
    title: "Первое сообщение (нерабочее время)",
    description: "Автоответ, если кандидат откликнулся вне рабочих часов вакансии.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "effectiveMessage", path: "offHoursMessage" },
  },
  {
    key: "msg.reject",
    title: "Текст отказа",
    description: "Нейтральный текст, уходит кандидату при отказе (ручном или авто по низкому баллу — legacy AI-фильтр).",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "effectiveMessage", path: "rejectMessage" },
  },
  {
    key: "spec.rejectLetter",
    title: "Письмо отказа (Портрет, по баллу резюме)",
    description: "Уходит кандидату при авто-отказе по баллу резюме, когда вакансия оценивается из Портрета (vacancies.portrait_scoring).",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "rejectLetter", default: DEFAULT_REJECT_LETTER },
  },
  {
    key: "stopfactors.rejectionText",
    title: "Единый текст отказа — стоп-факторы",
    description: "Уходит кандидату при срабатывании любого стоп-фактора вакансии. Один текст на весь блок (ТК РФ — нейтральная формулировка).",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "vacancy", path: "stopFactorsJson.rejectionText", default: "" },
  },
  {
    key: "msg.firstMessageDelay",
    title: "Задержка первого сообщения",
    description: "«Человеческая» пауза перед первым сообщением, секунды.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "effectiveMessage", path: "firstMessageDelaySeconds" },
  },
  {
    key: "msg.stopWordFarewell",
    title: "Прощание при стоп-слове",
    description: "Текст, который уходит кандидату при срабатывании стоп-слова (Портрет).",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "vacancy", path: "descriptionJson.autoResponder.stopWordFarewellText", default: "" },
  },
  {
    // DEPRECATED (14.07, аудит карты настроек): UI-блок удалён 22.05.2026
    // (см. components/vacancies/automation-settings.tsx:378, комментарий
    // "#19 anketaConfirmation — устаревший блок"). Поле
    // descriptionJson.automation.anketaConfirmation.messageText в БД
    // остаётся только для совместимости со старыми записями (сохраняется
    // байт-в-байт при пересохранении вакансии, новых значений никто не
    // пишет). Строку из реестра НЕ удаляем (аддитивность/аудит-хвост) —
    // помечена deprecated:true.
    key: "msg.anketaConfirmation",
    title: "Подтверждение после анкеты",
    description: "УСТАРЕЛО: автосообщение сразу после отправки кандидатом финальной анкеты. UI редактирования удалён 22.05.2026, значение в БД только читается (совместимость).",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: null,
    deprecated: true,
    resolve: { kind: "vacancy", path: "descriptionJson.automation.anketaConfirmation.messageText", default: "" },
  },
  {
    key: "msg.scheduleInvite",
    title: "Приглашение записаться на интервью",
    description: "Текст со ссылкой /schedule/[token] при переходе кандидата на стадию интервью.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "vacancy", path: "scheduleInviteText", default: "" },
  },
  {
    key: "msg.testInvite",
    title: "Приглашение пройти тест",
    description: "Текст со ссылкой /test/[token], отправляется при рассылке теста кандидатам.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=content",
    resolve: { kind: "demoSettings", path: "test:testInviteMessage", default: "" },
  },
  {
    key: "msg.secondDemoInvite",
    title: "Приглашение на 2-ю часть демо",
    description: "Отправляется прошедшим анкету с баллом выше порога.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaPassInvite.messageText", default: "" },
  },
  {
    key: "msg.dozhimBranchA",
    title: "Дожим — ветка «не открыл демо»",
    description: "Пресет/кастомные тексты дожима для не открывших демо.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "vacancy", path: "followUpCampaign.customMessages", default: null },
  },
  {
    key: "msg.dozhimBranchB",
    title: "Дожим — ветка «открыл, не завершил»",
    description: "Пресет/кастомные тексты дожима для открывших демо, но не дошедших до конца.",
    group: "Сообщения кандидатам",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "vacancy", path: "followUpCampaign.customMessagesOpened", default: null },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Пороги и гейты — резюме и анкета
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "gate.resumeEnabled",
    title: "Оценка резюме включена",
    description: "Скоринг резюме применяется при входе кандидата (Портрет).",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "resumeThresholds.enabled", default: true },
  },
  {
    key: "gate.resumeLower",
    title: "Резюме — нижний порог",
    description: "score < нижний → авто-действие (rejectAction).",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "resumeThresholds.lowerThreshold", default: 40 },
  },
  {
    key: "gate.resumeUpper",
    title: "Резюме — верхний порог",
    description: "score ≥ верхний → авто-приглашение (если включено).",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "resumeThresholds.upperThreshold", default: 75 },
  },
  {
    key: "gate.resumeRejectAction",
    title: "Резюме — сценарий при низком балле",
    description: "none / pending_manual / pending_rejection.",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "resumeThresholds.rejectAction", default: "none" },
  },
  {
    key: "gate.resumeRejectionDelay",
    title: "Резюме — задержка отказа",
    description: "Минуты до исполнения отложенного отказа (0 = мгновенно).",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "resumeThresholds.rejectionDelayMinutes", default: 60 },
  },
  {
    key: "gate.anketaEnabled",
    title: "Оценка анкеты включена",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaThresholds.enabled", default: true },
  },
  {
    key: "gate.anketaUpper",
    title: "Анкета — верхний порог",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaThresholds.upperThreshold", default: 75 },
  },
  {
    key: "gate.anketaLower",
    title: "Анкета — нижний порог",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaThresholds.lowerThreshold", default: 50 },
  },
  {
    key: "gate.anketaPassEnabled",
    title: "Приглашение на 2-ю часть демо включено",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaPassInvite.enabled", default: false },
  },
  {
    key: "gate.anketaPassThreshold",
    title: "Порог детерминированного балла (2-я часть демо)",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaPassInvite.passThreshold", default: 35 },
  },
  {
    key: "gate.anketaPassAiEvalThreshold",
    title: "Порог AI-оценки ответов (2-я часть демо)",
    description: "ИЛИ-гейт с детерминированным баллом — достаточно любого из двух.",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaPassInvite.aiEvalThreshold", default: 45 },
  },
  {
    key: "gate.anketaFailAction",
    title: "Анкета — сценарий при непрохождении гейта",
    description: "none / pending_manual / pending_rejection.",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "anketaPassInvite.failAction", default: "none" },
  },
  {
    key: "gate.hotCandidateEnabled",
    title: "Алерт «горячий кандидат стынет»",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "hotCandidateAlert.enabled", default: false },
  },
  {
    key: "gate.hotCandidateThreshold",
    title: "Горячий кандидат — порог балла",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "hotCandidateAlert.threshold", default: 70 },
  },
  {
    key: "gate.hotCandidateStaleHours",
    title: "Горячий кандидат — через сколько часов алерт",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "spec", path: "hotCandidateAlert.staleAfterHours", default: 3 },
  },
  {
    key: "gate.dozhimPortraitGateEnabled",
    title: "Гейт дожима по Портрету",
    description: "Не дожимать кандидатов с баллом Портрета ниже минимума.",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "vacancy", path: "followUpCampaign.minPortraitScoreEnabled", default: false },
  },
  {
    key: "gate.dozhimPortraitGateMin",
    title: "Гейт дожима по Портрету — минимальный балл",
    group: "Пороги и гейты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=communications",
    resolve: { kind: "vacancy", path: "followUpCampaign.minPortraitScore", default: 30 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Приоритет и окна отправки
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "send.priorityOrder",
    title: "Очерёдность исходящих сообщений",
    description: "Порядок групп приоритета (сверху = уходит первым).",
    group: "Приоритет и окна отправки",
    level: "company",
    editPath: "/hr/hiring-settings?tab=funnel",
    resolve: { kind: "companyHiringDefaults", path: "sendPriorityOrder", default: null },
  },
  {
    key: "send.messageWindows",
    title: "Окна отправки по типу касания",
    description: "always (круглосуточно) или window (по расписанию вакансии).",
    group: "Приоритет и окна отправки",
    level: "company",
    editPath: "/hr/hiring-settings?tab=funnel",
    resolve: { kind: "companyHiringDefaults", path: "messageWindows", default: null },
  },
  {
    key: "send.delaySeconds",
    title: "Задержка между отправками (hh-чат)",
    description: "Минимальный интервал между follow-up сообщениями, секунды.",
    group: "Приоритет и окна отправки",
    level: "company",
    editPath: "/hr/hiring-settings?tab=service",
    resolve: { kind: "companyColumn", path: "followUpSendDelaySeconds", default: 31 },
  },
  {
    key: "send.dozhimOncePerDay",
    title: "Лимит дожима — раз в день",
    description: "Кандидату не может уйти больше одного дожима в сутки.",
    group: "Приоритет и окна отправки",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "1 дожим/день (rate_limit_one_per_day)",
    resolve: { kind: "code" },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Корзина и хранение
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "trash.retentionDaysCompany",
    title: "Корзина вакансий — срок хранения",
    description: "Дней до авто-удаления вакансии из корзины.",
    group: "Корзина и хранение",
    level: "company",
    editPath: "/hr/hiring-settings?tab=service",
    resolve: { kind: "companyColumn", path: "trashRetentionDays", default: 30 },
  },
  {
    key: "trash.retentionDaysPlatform",
    title: "Корзина компаний — срок хранения (платформа)",
    description: "Платформенный дефолт срока хранения (используется, если у компании не задан свой).",
    group: "Корзина и хранение",
    level: "platform",
    editPath: null,
    resolve: { kind: "platformSetting", path: "trash_retention_days", default: 7 },
  },
  {
    key: "trash.reserveRetentionMonths",
    title: "Резерв — срок хранения до авто-перемещения в корзину",
    description: "Месяцев. 0 = никогда не удалять.",
    group: "Корзина и хранение",
    level: "company",
    editPath: "/hr/hiring-settings?tab=service",
    resolve: { kind: "companyHiringDefaults", path: "reserveRetentionMonths", default: 5 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: AI-токены и лимиты
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "ai.monthlyTokenLimitCompany",
    title: "Лимит AI-токенов/мес (компания)",
    description: "Переопределяет платформенный дефолт (База знаний).",
    group: "AI-токены и лимиты",
    level: "company",
    editPath: "/hr/hiring-settings?tab=service",
    resolve: { kind: "companyHiringDefaults", path: "aiMonthlyTokenLimit", default: null },
  },
  {
    key: "ai.chatbotDailyLimit",
    title: "Дневной лимит сообщений AI чат-бота",
    description: "Максимум ответов бота одному кандидату в сутки.",
    group: "AI-токены и лимиты",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-builder",
    resolve: { kind: "vacancy", path: "aiChatbotSettings.dailyMessageLimit", default: 5 },
  },
  {
    key: "ai.chatbotPlatformDailyLimit",
    title: "Дневной лимит AI чат-бота (платформенный предохранитель)",
    group: "AI-токены и лимиты",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "1000 сообщений/день (AI_CHATBOT_DAILY_LIMIT)",
    resolve: { kind: "code" },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Безопасность AI чат-бота (витрина долга)
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "security.injectionConfidence",
    title: "Порог уверенности — попытка инъекции промпта",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "0.85 (INCOMING_INJECTION_CONFIDENCE)",
    resolve: { kind: "code" },
  },
  {
    key: "security.severeAbuseConfidence",
    title: "Порог уверенности — грубое нарушение (мат/угрозы)",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "0.7 (INCOMING_SEVERE_ABUSE_CONFIDENCE)",
    resolve: { kind: "code" },
  },
  {
    key: "security.mediumAbuseConfidence",
    title: "Порог уверенности — среднее нарушение",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "0.6 (INCOMING_MEDIUM_ABUSE_CONFIDENCE)",
    resolve: { kind: "code" },
  },
  {
    key: "security.spamThreshold",
    title: "Порог спама/флуда",
    description: "Сообщений в час от одного кандидата, после которых — эскалация.",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "10 сообщений/час",
    resolve: { kind: "code" },
  },
  {
    key: "security.pingPongCooldown",
    title: "Cooldown между ответами AI (защита от петель)",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "60 секунд",
    resolve: { kind: "code" },
  },
  {
    key: "security.entryGateAiWaitMax",
    title: "Предел ожидания AI-оценки резюме (входной гейт)",
    description: "Если резюме не оценено за это время — гейт пропускает кандидата дальше.",
    group: "Безопасность AI чат-бота",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "4 часа (ENTRY_GATE_AI_WAIT_MAX_MS)",
    resolve: { kind: "code" },
  },
  {
    key: "security.abuseModeCompany",
    title: "Режим строгости к нарушениям (компания)",
    description: "strict — автоотказ + сообщение. lenient — предупреждение, диалог продолжается.",
    group: "Безопасность AI чат-бота",
    level: "company",
    editPath: "/hr/hiring-settings?tab=service",
    resolve: { kind: "companyColumn", path: "aiAbuseMode", default: "strict" },
  },
  {
    key: "security.chatbotConfidenceThreshold",
    title: "Порог уверенности intent-классификации (per-вакансия)",
    group: "Безопасность AI чат-бота",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-builder",
    resolve: { kind: "vacancy", path: "aiChatbotSettings.confidenceThreshold", default: 0.7 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Стоп-факторы
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "stopfactors.companyDefaults",
    title: "Стоп-факторы — дефолты компании",
    description: "city/format/age/experience/documents/citizenship/salaryExpectation.",
    group: "Стоп-факторы",
    level: "company",
    editPath: "/hr/hiring-settings?tab=stop-factors",
    resolve: { kind: "companyHiringDefaults", path: "stopFactorsDefaults", default: null },
  },
  {
    key: "stopfactors.applyToAll",
    title: "Стоп-факторы — применять ко всем вакансиям",
    description: "Мастер-тумблер: живьём применять дефолты компании при обработке hh-очереди.",
    group: "Стоп-факторы",
    level: "company",
    editPath: "/hr/hiring-settings?tab=stop-factors",
    resolve: { kind: "companyHiringDefaults", path: "stopFactorsApplyToAll", default: false },
  },
  {
    key: "stopfactors.vacancy",
    title: "Стоп-факторы вакансии",
    description: "Переопределение стоп-факторов на уровне конкретной вакансии.",
    group: "Стоп-факторы",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-builder",
    resolve: { kind: "vacancy", path: "stopFactorsJson", default: {} },
  },
  {
    key: "stopfactors.stopWordsBaseline",
    title: "Базовый список стоп-слов (платформа)",
    description: "Применяется, если у вакансии нет своего списка.",
    group: "Стоп-факторы",
    level: "platform",
    editPath: null,
    resolve: { kind: "platformSetting", path: "stop_words_baseline", default: null },
  },
  {
    key: "stopfactors.vacancyStopWords",
    title: "Стоп-слова вакансии",
    description: "Список слов-триггеров отказа/прощания (Портрет).",
    group: "Стоп-факторы",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=spec",
    resolve: { kind: "vacancy", path: "stopWordsJson", default: null },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Расписание и интервью
  // Хаб редактирования — шестерёнка календаря /hr/calendar?settings=1,
  // таб «Запись кандидатов» (задача #6, 11.07). Хранение —
  // companies.hiring_defaults_json.schedule (не менялось).
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "schedule.interviewMethodConfigs",
    title: "Способы интервью: длительность и буфер",
    description: "Per-method модель (звонок/онлайн/офис): вкл, длительность, буфер. Канонические дефолты 15/25/45 мин — lib/hiring/interview-methods.ts.",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.interviewMethodConfigs", default: null },
  },
  {
    key: "schedule.defaultInterviewMethod",
    title: "Способ интервью по умолчанию",
    description: "Каким способом записывать кандидата, если воронка/HR не выбрали иное.",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.defaultInterviewMethod", default: null },
  },
  {
    key: "schedule.officeAddress",
    title: "Адрес офиса (интервью в офисе)",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.officeAddress", default: null },
  },
  {
    key: "schedule.timezone",
    title: "Часовой пояс HR (запись и слоты)",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.timezone", default: "Europe/Moscow" },
  },
  {
    key: "schedule.maxPerDay",
    title: "Максимум интервью в день",
    description: "0 — запись временно закрыта (валидное значение, не дефолт).",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.maxPerDay", default: null },
  },
  {
    key: "schedule.slotStep",
    title: "Шаг сетки слотов записи",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.slotStep", default: 30 },
  },
  {
    key: "schedule.interviewDaySchedule",
    title: "Окна записи по дням недели",
    description: "У дня может быть несколько окон; день без окон — запись закрыта. Если не задано — деривация из legacy interviewDays/From/To (lib/schedule/day-windows.ts).",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.interviewDaySchedule", default: null },
  },
  {
    key: "schedule.interviewDaySchedule.vacancy",
    title: "Окна записи вакансии (переопределение)",
    description: "Per-vacancy окна самозаписи; если не заданы — действуют окна компании.",
    group: "Расписание и интервью",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=ai",
    resolve: { kind: "vacancy", path: "descriptionJson.interviewDaySchedule", default: null },
  },
  {
    key: "schedule.remind24h",
    title: "Напоминание за сутки до интервью",
    description: "Шлётся, только если интервью назначено больше чем за 36 часов.",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.remind24h", default: true },
  },
  {
    key: "schedule.remindMorning",
    title: "Напоминание утром в день интервью",
    description: "В 9:00 по часовому поясу вакансии, если встреча ещё впереди.",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.remindMorning", default: true },
  },
  {
    key: "schedule.remind1h",
    title: "Напоминание за 1 час до интервью",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.remind1h", default: true },
  },
  {
    key: "schedule.remind15m",
    title: "Напоминание за 15 минут до интервью",
    group: "Расписание и интервью",
    level: "company",
    editPath: "/hr/calendar?settings=1",
    resolve: { kind: "companyHiringDefaults", path: "schedule.remind15m", default: true },
  },
  {
    key: "schedule.remind2h",
    title: "Напоминание за 2 часа до интервью (легаси)",
    description: "Тумблер убран из UI (заменён порогами 24ч/утро/1ч/15м); сохранённое значение продолжает уважаться кроном.",
    group: "Расписание и интервью",
    level: "company",
    editPath: null,
    resolve: { kind: "companyHiringDefaults", path: "schedule.remind2h", default: true },
  },
  {
    key: "schedule.slotDuration",
    title: "Длительность слота записи (легаси)",
    description: "Заменена per-method interviewMethodConfigs; используется только как fallback нормализации старых данных.",
    group: "Расписание и интервью",
    level: "company",
    editPath: null,
    resolve: { kind: "companyHiringDefaults", path: "schedule.slotDuration", default: null },
  },
  {
    key: "schedule.bufferTime",
    title: "Буфер между встречами (легаси)",
    description: "Заменён per-method interviewMethodConfigs; fallback нормализации старых данных.",
    group: "Расписание и интервью",
    level: "company",
    editPath: null,
    resolve: { kind: "companyHiringDefaults", path: "schedule.bufferTime", default: null },
  },
  {
    key: "schedule.interviewReminderText",
    title: "Текст напоминания об интервью",
    description: "Формируется кроном interview-reminders; текст пока не редактируется отдельно.",
    group: "Расписание и интервью",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "см. app/api/cron/interview-reminders/route.ts",
    resolve: { kind: "code" },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Воронка v2 — нативные поля (добавлено 14.07, аудит карты настроек)
  // Хранение — vacancies.description_json.funnelV2.{stage1,stage2,communications}
  // (jsonb, без миграции; см. lib/funnel-v2/types.ts::FunnelV2Stage1/Stage2/
  // Communications). Редактируются в конструкторе воронки v2
  // (components/vacancies/funnel-v2-builder.tsx, Stage1Card/Stage2Card/
  // CommunicationsCard). Дефолты кода — lib/funnel-v2/native-config.ts
  // (DEFAULT_STAGE1_*/DEFAULT_STAGE2_*/DEFAULT_HOT_CANDIDATE_THRESHOLD) —
  // используются, ТОЛЬКО когда движок v2 включён на вакансии И блок сохранён
  // явно; иначе эффективные значения берутся из Портрета (см. resolveStage1
  // и др. в native-config.ts — сюда карта настроек не заглядывает, показывает
  // только собственно нативное значение вакансии/дефолт кода).
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "funnelV2.stage1.inviteDelaySeconds",
    title: "Воронка v2 — Стадия 1: задержка первого сообщения",
    description: "«Человеческая» пауза перед первым сообщением, секунды.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.inviteDelaySeconds", default: 180 },
  },
  {
    key: "funnelV2.stage1.offHoursEnabled",
    title: "Воронка v2 — Стадия 1: мягкое подтверждение в нерабочее время",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.offHoursEnabled", default: true },
  },
  {
    key: "funnelV2.stage1.offHoursDelaySeconds",
    title: "Воронка v2 — Стадия 1: задержка подтверждения в нерабочее время",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.offHoursDelaySeconds", default: 15 },
  },
  {
    key: "funnelV2.stage1.offHoursText",
    title: "Воронка v2 — Стадия 1: текст подтверждения в нерабочее время",
    description: "Пусто → дефолт компании/Портрета.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.offHoursText", default: "" },
  },
  {
    key: "funnelV2.stage1.rejectLetter",
    title: "Воронка v2 — Стадия 1: письмо авто-отказа по баллу резюме",
    description: "Пусто → дефолт вакансии/платформы (Портрет).",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.rejectLetter", default: "" },
  },
  {
    key: "funnelV2.stage1.rejectionDelayMinutes",
    title: "Воронка v2 — Стадия 1: задержка авто-отказа",
    description: "Минуты.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage1.rejectionDelayMinutes", default: 60 },
  },
  {
    key: "funnelV2.stage2.enabled",
    title: "Воронка v2 — Стадия 2: переход на 2-ю часть демо включён",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.enabled", default: false },
  },
  {
    key: "funnelV2.stage2.passThreshold",
    title: "Воронка v2 — Стадия 2: порог объективного балла",
    description: "0-100, вопросы-выбора (ИЛИ-гейт с aiEvalThreshold).",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.passThreshold", default: 35 },
  },
  {
    key: "funnelV2.stage2.aiEvalThreshold",
    title: "Воронка v2 — Стадия 2: порог AI-оценки ответов анкеты",
    description: "0-100, ИЛИ-гейт с passThreshold.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.aiEvalThreshold", default: 45 },
  },
  {
    key: "funnelV2.stage2.transferMode",
    title: "Воронка v2 — Стадия 2: режим перехода",
    description: "seamless / message / both.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.transferMode", default: "both" },
  },
  {
    key: "funnelV2.stage2.contentBlockId",
    title: "Воронка v2 — Стадия 2: блок контента 2-й части",
    description: "id demos-записи. null = боевой блок.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.contentBlockId", default: null },
  },
  {
    key: "funnelV2.stage2.passScreenTitle",
    title: "Воронка v2 — Стадия 2: заголовок экрана «прошёл гейт»",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.passScreenTitle", default: "" },
  },
  {
    key: "funnelV2.stage2.passScreenText",
    title: "Воронка v2 — Стадия 2: текст экрана «прошёл гейт»",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.passScreenText", default: "" },
  },
  {
    key: "funnelV2.stage2.messageText",
    title: "Воронка v2 — Стадия 2: текст письма-приглашения",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.messageText", default: "" },
  },
  {
    key: "funnelV2.stage2.delaySeconds",
    title: "Воронка v2 — Стадия 2: задержка приглашения на 2-ю часть",
    description: "Секунды.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.delaySeconds", default: 900 },
  },
  {
    key: "funnelV2.stage2.failScreenTitle",
    title: "Воронка v2 — Стадия 2: заголовок экрана «не прошёл гейт»",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.failScreenTitle", default: "" },
  },
  {
    key: "funnelV2.stage2.failScreenText",
    title: "Воронка v2 — Стадия 2: текст экрана «не прошёл гейт»",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.failScreenText", default: "" },
  },
  {
    key: "funnelV2.stage2.failAction",
    title: "Воронка v2 — Стадия 2: сценарий при непрохождении гейта",
    description: "none / pending_manual / pending_rejection.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.failAction", default: "none" },
  },
  {
    key: "funnelV2.stage2.failRejectDelayMinutes",
    title: "Воронка v2 — Стадия 2: задержка авто-отказа не прошедших гейт",
    description: "Минуты.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.stage2.failRejectDelayMinutes", default: 60 },
  },
  {
    key: "funnelV2.communications.tgAlerts.enabled",
    title: "Воронка v2 — Коммуникации: TG-алерт подходящих кандидатов",
    description: "Карточка кандидата в Telegram-канал компании, когда он проходит пороги.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.tgAlerts.enabled", default: false },
  },
  {
    key: "funnelV2.communications.tgAlerts.minResumeScore",
    title: "Воронка v2 — Коммуникации: мин. балл резюме для TG-алерта",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.tgAlerts.minResumeScore", default: null },
  },
  {
    key: "funnelV2.communications.tgAlerts.minAnswersScore",
    title: "Воронка v2 — Коммуникации: мин. балл ответов для TG-алерта",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.tgAlerts.minAnswersScore", default: null },
  },
  {
    key: "funnelV2.communications.tgAlerts.onGatePassed",
    title: "Воронка v2 — Коммуникации: слать TG-алерт при прохождении гейта",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.tgAlerts.onGatePassed", default: true },
  },
  {
    key: "funnelV2.communications.hotCandidate.enabled",
    title: "Воронка v2 — Коммуникации: алерт «горячий кандидат стынет»",
    description: "Уведомить HR, если кандидат с высоким баллом открыл демо и застыл.",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.hotCandidate.enabled", default: false },
  },
  {
    key: "funnelV2.communications.hotCandidate.threshold",
    title: "Воронка v2 — Коммуникации: порог «горячего» балла",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.hotCandidate.threshold", default: 70 },
  },
  {
    key: "funnelV2.communications.hotCandidate.staleAfterHours",
    title: "Воронка v2 — Коммуникации: часов бездействия до алерта",
    group: "Воронка v2 — нативные поля",
    level: "vacancy",
    editPath: "/hr/vacancies/[id]?tab=settings&section=funnel-v2",
    resolve: { kind: "vacancy", path: "descriptionJson.funnelV2.communications.hotCandidate.staleAfterHours", default: 3 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Группа: Прочие захардкоженные (витрина долга)
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "misc.nextStepInviteNote",
    title: "Пометка следующего шага в hh-чате",
    description: "Комментарий, добавляемый рядом с приглашением (demo/interview/video/call).",
    group: "Прочее (в коде)",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "NEXT_STEP_INVITE_NOTE (lib/hh/process-queue.ts)",
    resolve: { kind: "code" },
  },
  {
    key: "misc.insistDemoMessages",
    title: "Тексты «настойчивого» напоминания открыть демо",
    description: "3 сообщения, отправляются, если кандидат не открывает демо.",
    group: "Прочее (в коде)",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "DEFAULT_INSIST_DEMO_MESSAGES (lib/hh/scan-incoming.ts)",
    resolve: { kind: "code" },
  },
  {
    key: "misc.uploadSizeLimit",
    title: "Лимит размера загружаемого файла",
    group: "Прочее (в коде)",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "200 МБ (app/api/upload/route.ts)",
    resolve: { kind: "code" },
  },
  {
    key: "misc.demoPdnConsent",
    title: "Согласие на обработку ПДн в анкете демо",
    description: "Текст согласия сейчас зашит в публичной странице демо.",
    group: "Прочее (в коде)",
    level: "platform",
    editPath: null,
    hardcoded: true,
    codeValue: "см. app/(public)/demo/[token]",
    resolve: { kind: "code" },
  },
]

export function getSettingsGroups(): string[] {
  const seen = new Set<string>()
  const groups: string[] = []
  for (const e of SETTINGS_REGISTRY) {
    if (!seen.has(e.group)) { seen.add(e.group); groups.push(e.group) }
  }
  return groups
}
