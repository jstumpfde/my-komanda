export interface CronRegistryEntry {
  name: string
  endpoint: string
  schedule: string | null
  description: string
}

export const CRON_REGISTRY: CronRegistryEntry[] = [
  {
    name: "adaptation",
    endpoint: "/api/cron/adaptation",
    schedule: null,
    description: "Продвижение программы адаптации: отправка шагов, обновление прогресса",
  },
  {
    name: "ai-chatbot-watcher",
    endpoint: "/api/cron/ai-chatbot-watcher",
    schedule: "0 * * * *",
    description: "Аудит AI чат-бота: поиск аномалий в последних диалогах",
  },
  {
    name: "auto-invoices",
    endpoint: "/api/cron/auto-invoices",
    schedule: "0 6 * * *",
    description: "Автоматическое выставление счетов на продление за 7 дней до конца периода",
  },
  {
    name: "avito-incoming-messages",
    endpoint: "/api/cron/avito-incoming-messages",
    schedule: "*/15 * * * *",
    description: "Резервная обработка входящих сообщений Авито (страховка от таймаута webhook)",
  },
  {
    name: "check-subscriptions",
    endpoint: "/api/cron/check-subscriptions",
    schedule: null,
    description: "Перевод истёкших триальных компаний в статус expired",
  },
  {
    name: "flight-risk-alerts",
    endpoint: "/api/cron/flight-risk-alerts",
    schedule: null,
    description: "Уведомления о сотрудниках с высоким/критическим риском увольнения",
  },
  {
    name: "follow-up",
    endpoint: "/api/cron/follow-up",
    schedule: "*/15 * * * *",
    description: "Отправка цепочки дожима кандидатам в hh-чат",
  },
  {
    name: "health-check",
    endpoint: "/api/cron/health-check",
    schedule: null,
    description: "Мониторинг свежести критичных кронов (staleness check)",
  },
  {
    name: "hh-cleanup-stuck",
    endpoint: "/api/cron/hh-cleanup-stuck",
    schedule: null,
    description: "Перевод зависших hh-откликов (orphaned) у терминальных кандидатов",
  },
  {
    name: "hh-import",
    endpoint: "/api/cron/hh-import",
    schedule: "* * * * *",
    description: "Импорт новых откликов с hh.ru и запуск очереди разбора",
  },
  {
    name: "hh-import-burst",
    endpoint: "/api/cron/hh-import-burst",
    schedule: null,
    description: "Пакетный разбор откликов hh (несколько итераций за один вызов)",
  },
  {
    name: "hh-incoming-messages",
    endpoint: "/api/cron/hh-incoming-messages",
    schedule: "*/15 * * * *",
    description: "Обработка входящих сообщений от кандидатов в hh-чате",
  },
  {
    name: "hh-token-refresh",
    endpoint: "/api/cron/hh-token-refresh",
    schedule: "0 5 * * *",
    description: "Обновление истёкших OAuth-токенов hh у дормантных компаний",
  },
  {
    name: "hh-vacancy-sync",
    endpoint: "/api/cron/hh-vacancy-sync",
    schedule: "30 2 * * *",
    description: "Синхронизация статуса публикации вакансий с hh (флаг archived)",
  },
  {
    name: "interview-reminders",
    endpoint: "/api/cron/interview-reminders",
    schedule: "0 * * * *",
    description: "Напоминания об интервью за 24 ч и 2 ч до начала",
  },
  {
    name: "knowledge-freshness",
    endpoint: "/api/cron/knowledge-freshness",
    schedule: null,
    description: "Проверка актуальности материалов базы знаний, уведомления директору",
  },
  {
    name: "knowledge-gaps",
    endpoint: "/api/cron/knowledge-gaps",
    schedule: null,
    description: "Еженедельный аудит неотвеченных вопросов к базе знаний, рекомендации AI",
  },
  {
    name: "knowledge-progress",
    endpoint: "/api/cron/knowledge-progress",
    schedule: null,
    description: "Еженедельная сводка по прогрессу обучения сотрудников",
  },
  {
    name: "knowledge-reminders",
    endpoint: "/api/cron/knowledge-reminders",
    schedule: null,
    description: "Ежедневные напоминания о дедлайнах по назначениям обучения",
  },
  {
    name: "knowledge-review",
    endpoint: "/api/cron/knowledge-review",
    schedule: null,
    description: "Флаг устаревших материалов базы знаний (review cycle / valid_until)",
  },
  {
    name: "pending-rejections",
    endpoint: "/api/cron/pending-rejections",
    schedule: "*/5 * * * *",
    description: "Исполнение отложенных отказов кандидатам в рабочее время вакансии",
  },
  {
    name: "prequalification",
    endpoint: "/api/cron/prequalification",
    schedule: "*/15 * * * *",
    description: "Напоминания и таймаут-фолбэк для кандидатов в предквалификации",
  },
  {
    name: "pulse-alerts",
    endpoint: "/api/cron/pulse-alerts",
    schedule: null,
    description: "Уведомления о сотрудниках с низким пульс-баллом (<3)",
  },
  {
    name: "recalculate-flight-risk",
    endpoint: "/api/cron/recalculate-flight-risk",
    schedule: null,
    description: "Пересчёт риска увольнения по всем сотрудникам",
  },
  {
    name: "recalculate-integrator-levels",
    endpoint: "/api/cron/recalculate-integrator-levels",
    schedule: null,
    description: "Пересчёт уровней партнёров-интеграторов по числу клиентов",
  },
  {
    name: "rubric-score",
    endpoint: "/api/cron/rubric-score",
    schedule: "*/15 * * * *",
    description: "Авто-скоринг рубрикой для незаполненных кандидатов",
  },
  {
    name: "sales-follow-up",
    endpoint: "/api/cron/sales-follow-up",
    schedule: "*/15 * * * *",
    description: "Дожим лидов продаж: шаблонные сообщения по активным диалогам",
  },
  {
    name: "trash-cleanup",
    endpoint: "/api/cron/trash-cleanup",
    schedule: "0 0 * * *",
    description: "Окончательное удаление объектов из корзины по истечении срока хранения",
  },
]
