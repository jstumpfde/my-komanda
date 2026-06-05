export interface CronEntry {
  name: string
  endpoint: string
  schedule: string | null
  description: string
}

export const CRON_REGISTRY: CronEntry[] = [
  {
    name: "adaptation",
    endpoint: "/api/cron/adaptation",
    schedule: null,
    description: "Продвижение адаптационных заданий: отправка напоминаний и переход к следующему дню",
  },
  {
    name: "ai-chatbot-watcher",
    endpoint: "/api/cron/ai-chatbot-watcher",
    schedule: "0 * * * *",
    description: "AI-мониторинг чат-бота: аудит диалогов и генерация уведомлений о проблемах",
  },
  {
    name: "auto-invoices",
    endpoint: "/api/cron/auto-invoices",
    schedule: "0 6 * * *",
    description: "Автовыставление счетов на продление за 7 дней до конца оплаченного периода",
  },
  {
    name: "check-subscriptions",
    endpoint: "/api/cron/check-subscriptions",
    schedule: null,
    description: "Перевод компаний с истёкшим триалом в статус expired",
  },
  {
    name: "flight-risk-alerts",
    endpoint: "/api/cron/flight-risk-alerts",
    schedule: null,
    description: "Генерация алертов о высоком/критическом риске увольнения сотрудников",
  },
  {
    name: "follow-up",
    endpoint: "/api/cron/follow-up",
    schedule: "*/15 * * * *",
    description: "Отправка дожимных сообщений кандидатам через hh-чат по расписанию кампаний",
  },
  {
    name: "health-check",
    endpoint: "/api/cron/health-check",
    schedule: null,
    description: "Проверка работоспособности критичных кронов и алертинг при просрочке",
  },
  {
    name: "hh-cleanup-stuck",
    endpoint: "/api/cron/hh-cleanup-stuck",
    schedule: null,
    description: "Перевод застрявших hh-откликов от терминальных кандидатов в статус orphaned",
  },
  {
    name: "hh-import",
    endpoint: "/api/cron/hh-import",
    schedule: "* * * * *",
    description: "Импорт откликов с hh.ru и разбор очереди кандидатов по активным вакансиям",
  },
  {
    name: "hh-import-burst",
    endpoint: "/api/cron/hh-import-burst",
    schedule: null,
    description: "Пакетный разбор hh-откликов: несколько итераций за один вызов (по кнопке «Разобрать всё»)",
  },
  {
    name: "hh-incoming-messages",
    endpoint: "/api/cron/hh-incoming-messages",
    schedule: "*/15 * * * *",
    description: "Получение и классификация входящих сообщений кандидатов из hh-чата",
  },
  {
    name: "hh-token-refresh",
    endpoint: "/api/cron/hh-token-refresh",
    schedule: "0 5 * * *",
    description: "Обновление истёкших hh OAuth-токенов у дормантных компаний",
  },
  {
    name: "interview-reminders",
    endpoint: "/api/cron/interview-reminders",
    schedule: "0 * * * *",
    description: "Напоминания об интервью за 24ч/2ч до начала: in-app и Telegram-канал компании по записям календаря",
  },
  {
    name: "knowledge-freshness",
    endpoint: "/api/cron/knowledge-freshness",
    schedule: null,
    description: "Пометка устаревших/требующих проверки материалов базы знаний и уведомления руководителям",
  },
  {
    name: "knowledge-gaps",
    endpoint: "/api/cron/knowledge-gaps",
    schedule: null,
    description: "Еженедельный аудит неотвеченных вопросов и AI-рекомендации по созданию материалов",
  },
  {
    name: "knowledge-progress",
    endpoint: "/api/cron/knowledge-progress",
    schedule: null,
    description: "Еженедельный отчёт по прогрессу обучения: завершили / отстают / просрочили",
  },
  {
    name: "knowledge-reminders",
    endpoint: "/api/cron/knowledge-reminders",
    schedule: null,
    description: "Ежедневные напоминания сотрудникам о дедлайнах по назначенным курсам",
  },
  {
    name: "knowledge-review",
    endpoint: "/api/cron/knowledge-review",
    schedule: null,
    description: "Пометка материалов с истекающим сроком проверки (valid_until / review_cycle)",
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
    description: "AI-предквалификация: напоминания (Д+1, Д+3) и финализация кандидатов с таймаутом",
  },
  {
    name: "pulse-alerts",
    endpoint: "/api/cron/pulse-alerts",
    schedule: null,
    description: "Генерация алертов о низких баллах пульс-опросов за последние 7 дней",
  },
  {
    name: "recalculate-flight-risk",
    endpoint: "/api/cron/recalculate-flight-risk",
    schedule: null,
    description: "Пересчёт индекса риска увольнения для всех сотрудников по доступным факторам",
  },
  {
    name: "recalculate-integrator-levels",
    endpoint: "/api/cron/recalculate-integrator-levels",
    schedule: null,
    description: "Пересчёт уровней интеграторов по количеству активных клиентов",
  },
  {
    name: "rubric-score",
    endpoint: "/api/cron/rubric-score",
    schedule: "*/15 * * * *",
    description: "Авто-скоринг рубрикой: оценка неоценённых кандидатов на активных вакансиях",
  },
  {
    name: "trash-cleanup",
    endpoint: "/api/cron/trash-cleanup",
    schedule: "0 0 * * *",
    description: "Жёсткое удаление вакансий, материалов, компаний и счетов из корзины по истечении срока хранения",
  },
]
