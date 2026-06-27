export interface CronEntry {
  name: string
  endpoint: string
  schedule: string | null
  description: string
}

export const CRON_REGISTRY: CronEntry[] = [
  {
    name:        "adaptation",
    endpoint:    "/api/cron/adaptation",
    schedule:    null,
    description: "Продвигает адаптационные назначения по шагам, создаёт отметки выполнения",
  },
  {
    name:        "ai-chatbot-watcher",
    endpoint:    "/api/cron/ai-chatbot-watcher",
    schedule:    "0 * * * *",
    description: "Аудит последних 20 сообщений чат-бота на каждой вакансии (AI Watcher)",
  },
  {
    name:        "auto-invoices",
    endpoint:    "/api/cron/auto-invoices",
    schedule:    "0 6 * * *",
    description: "Автовыставление счетов за подписку за 7 дней до истечения периода",
  },
  {
    name:        "avito-incoming-messages",
    endpoint:    "/api/cron/avito-incoming-messages",
    schedule:    "*/15 * * * *",
    description: "Резервная обработка входящих Авито-сообщений (дополнение к webhook)",
  },
  {
    name:        "check-subscriptions",
    endpoint:    "/api/cron/check-subscriptions",
    schedule:    null,
    description: "Переводит компании с истёкшим триалом в статус expired",
  },
  {
    name:        "dev-activity",
    endpoint:    "/api/cron/dev-activity",
    schedule:    "*/15 * * * *",
    description: "Сбор активности подрядчика через git SSH и анализ Claude",
  },
  {
    name:        "flight-risk-alerts",
    endpoint:    "/api/cron/flight-risk-alerts",
    schedule:    null,
    description: "Создаёт уведомления для сотрудников с высоким и критическим риском увольнения",
  },
  {
    name:        "follow-up",
    endpoint:    "/api/cron/follow-up",
    schedule:    "*/15 * * * *",
    description: "Отправляет очередные дожимные касания кандидатам через hh-чат",
  },
  {
    name:        "funnel-v2-tick",
    endpoint:    "/api/cron/funnel-v2-tick",
    schedule:    "*/5 * * * *",
    description: "Периодический тик рантайма воронки v2: авто-продвижение стадий demo",
  },
  {
    name:        "health-check",
    endpoint:    "/api/cron/health-check",
    schedule:    null,
    description: "Проверяет, что критичные кроны запускались в ожидаемый интервал",
  },
  {
    name:        "hh-cleanup-stuck",
    endpoint:    "/api/cron/hh-cleanup-stuck",
    schedule:    null,
    description: "Переводит зависшие hh-отклики (кандидат уже отклонён) в статус orphaned",
  },
  {
    name:        "hh-import",
    endpoint:    "/api/cron/hh-import",
    schedule:    "* * * * *",
    description: "Каждую минуту импортирует отклики с hh.ru и запускает их разбор",
  },
  {
    name:        "hh-import-burst",
    endpoint:    "/api/cron/hh-import-burst",
    schedule:    null,
    description: "Пакетный импорт hh-откликов: N итераций с задержкой (UI-кнопка «Разобрать всё»)",
  },
  {
    name:        "hh-incoming-messages",
    endpoint:    "/api/cron/hh-incoming-messages",
    schedule:    "*/15 * * * *",
    description: "Тянет новые сообщения из hh-чата и классифицирует их (regex + AI)",
  },
  {
    name:        "hh-token-refresh",
    endpoint:    "/api/cron/hh-token-refresh",
    schedule:    "0 5 * * *",
    description: "Обновляет истёкшие hh OAuth-токены у дормантных компаний",
  },
  {
    name:        "hh-vacancy-sync",
    endpoint:    "/api/cron/hh-vacancy-sync",
    schedule:    "30 2 * * *",
    description: "Синхронизирует статус публикации вакансий на hh (archived/active)",
  },
  {
    name:        "interview-reminders",
    endpoint:    "/api/cron/interview-reminders",
    schedule:    "0 * * * *",
    description: "Напоминания об интервью за 24ч и 2ч до начала HR и кандидату",
  },
  {
    name:        "knowledge-freshness",
    endpoint:    "/api/cron/knowledge-freshness",
    schedule:    null,
    description: "Сканирует базу знаний, обновляет статус устаревших материалов и уведомляет директора",
  },
  {
    name:        "knowledge-gaps",
    endpoint:    "/api/cron/knowledge-gaps",
    schedule:    null,
    description: "Еженедельно анализирует неотвеченные вопросы и рекомендует материалы через Claude",
  },
  {
    name:        "knowledge-progress",
    endpoint:    "/api/cron/knowledge-progress",
    schedule:    null,
    description: "Еженедельная сводка по прогрессу обучения: завершили, отстают, просрочили",
  },
  {
    name:        "knowledge-reminders",
    endpoint:    "/api/cron/knowledge-reminders",
    schedule:    null,
    description: "Ежедневно напоминает сотрудникам о курсах с дедлайном менее 3 дней",
  },
  {
    name:        "knowledge-review",
    endpoint:    "/api/cron/knowledge-review",
    schedule:    null,
    description: "Ежедневно помечает материалы базы знаний, требующие проверки по циклу",
  },
  {
    name:        "pending-rejections",
    endpoint:    "/api/cron/pending-rejections",
    schedule:    "*/5 * * * *",
    description: "Исполняет отложенные отказы кандидатам в рабочее время вакансии",
  },
  {
    name:        "prequalification",
    endpoint:    "/api/cron/prequalification",
    schedule:    "*/15 * * * *",
    description: "Дожимные напоминания и финализация предквалификации по таймауту",
  },
  {
    name:        "pulse-alerts",
    endpoint:    "/api/cron/pulse-alerts",
    schedule:    null,
    description: "Создаёт уведомления для сотрудников с низким средним баллом пульс-опроса",
  },
  {
    name:        "recalculate-flight-risk",
    endpoint:    "/api/cron/recalculate-flight-risk",
    schedule:    null,
    description: "Пересчитывает баллы риска увольнения по пульсу, адаптации, навыкам и обучению",
  },
  {
    name:        "recalculate-integrator-levels",
    endpoint:    "/api/cron/recalculate-integrator-levels",
    schedule:    null,
    description: "Пересчитывает уровни интеграторов по количеству их клиентов",
  },
  {
    name:        "rubric-score",
    endpoint:    "/api/cron/rubric-score",
    schedule:    "*/15 * * * *",
    description: "Авто-скоринг кандидатов по рубрике для активных вакансий",
  },
  {
    name:        "sales-follow-up",
    endpoint:    "/api/cron/sales-follow-up",
    schedule:    "*/15 * * * *",
    description: "Дожим лидов продаж: шаблонные касания по активным диалогам",
  },
  {
    name:        "trash-cleanup",
    endpoint:    "/api/cron/trash-cleanup",
    schedule:    "0 0 * * *",
    description: "Навсегда удаляет вакансии, материалы и компании из корзины по истечению срока хранения",
  },
  {
    name:        "yandex-direct-agent",
    endpoint:    "/api/cron/yandex-direct-agent",
    schedule:    "0 3,9,15,21 * * *",
    description: "Синк кампаний Яндекс.Директ и автопилот оптимизации (раз в 6 часов)",
  },
]
