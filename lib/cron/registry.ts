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
    description: "Продвигает адаптационные назначения по шагам, отправляет уведомления",
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
    description: "Автовыставление счетов за подписку (раз в сутки)",
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
    name:        "flight-risk-alerts",
    endpoint:    "/api/cron/flight-risk-alerts",
    schedule:    null,
    description: "Создаёт уведомления для сотрудников с высоким/критическим риском увольнения",
  },
  {
    name:        "follow-up",
    endpoint:    "/api/cron/follow-up",
    schedule:    "*/15 * * * *",
    description: "Отправляет очередные дожимные касания кандидатам через hh-чат",
  },
  {
    name:        "health-check",
    endpoint:    "/api/cron/health-check",
    schedule:    null,
    description: "Проверяет свежесть прогонов критичных кронов, возвращает 503 при просрочке",
  },
  {
    name:        "hh-cleanup-stuck",
    endpoint:    "/api/cron/hh-cleanup-stuck",
    schedule:    null,
    description: "Переводит завязшие hh_responses в статус orphaned (кандидат уже в терминальной стадии)",
  },
  {
    name:        "hh-import",
    endpoint:    "/api/cron/hh-import",
    schedule:    "*/5 * * * *",
    description: "Импорт откликов с hh.ru и запуск очереди AI-обработки",
  },
  {
    name:        "hh-import-burst",
    endpoint:    "/api/cron/hh-import-burst",
    schedule:    null,
    description: "Пакетный запуск hh-импорта (N итераций подряд), вызывается UI-кнопкой «Разобрать всё»",
  },
  {
    name:        "hh-incoming-messages",
    endpoint:    "/api/cron/hh-incoming-messages",
    schedule:    "*/15 * * * *",
    description: "Читает входящие сообщения кандидатов из hh-чата и применяет стоп-слова/AI",
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
    description: "Синхронизирует статус hh_archived и hh_expires_at для вакансий (05:30 МСК)",
  },
  {
    name:        "interview-reminders",
    endpoint:    "/api/cron/interview-reminders",
    schedule:    "0 * * * *",
    description: "Отправляет напоминания о предстоящих интервью (за 24 ч и за 2 ч)",
  },
  {
    name:        "knowledge-freshness",
    endpoint:    "/api/cron/knowledge-freshness",
    schedule:    null,
    description: "Помечает устаревшие материалы базы знаний и уведомляет директора/HR-lead",
  },
  {
    name:        "knowledge-gaps",
    endpoint:    "/api/cron/knowledge-gaps",
    schedule:    null,
    description: "Еженедельный анализ неотвеченных вопросов БЗ с рекомендациями AI",
  },
  {
    name:        "knowledge-progress",
    endpoint:    "/api/cron/knowledge-progress",
    schedule:    null,
    description: "Еженедельный отчёт по прогрессу обучения сотрудников",
  },
  {
    name:        "knowledge-reminders",
    endpoint:    "/api/cron/knowledge-reminders",
    schedule:    null,
    description: "Ежедневные напоминания сотрудникам о назначениях с дедлайном < 3 дней",
  },
  {
    name:        "knowledge-review",
    endpoint:    "/api/cron/knowledge-review",
    schedule:    null,
    description: "Флагирует материалы БЗ с истекающим сроком действия или устаревшим циклом проверки",
  },
  {
    name:        "pending-rejections",
    endpoint:    "/api/cron/pending-rejections",
    schedule:    "*/15 * * * *",
    description: "Выполняет отложенные отказы кандидатам (pending_rejection_at <= now)",
  },
  {
    name:        "prequalification",
    endpoint:    "/api/cron/prequalification",
    schedule:    "*/15 * * * *",
    description: "Напоминания и фолбэк-финализация предквалификации кандидатов",
  },
  {
    name:        "pulse-alerts",
    endpoint:    "/api/cron/pulse-alerts",
    schedule:    null,
    description: "Создаёт уведомления для сотрудников с низкими пульс-баллами (< 3/5)",
  },
  {
    name:        "recalculate-flight-risk",
    endpoint:    "/api/cron/recalculate-flight-risk",
    schedule:    null,
    description: "Пересчитывает баллы риска увольнения по всем сотрудникам",
  },
  {
    name:        "recalculate-integrator-levels",
    endpoint:    "/api/cron/recalculate-integrator-levels",
    schedule:    null,
    description: "Обновляет уровни интеграторов на основе количества клиентов",
  },
  {
    name:        "rubric-score",
    endpoint:    "/api/cron/rubric-score",
    schedule:    "*/15 * * * *",
    description: "Автоматический AI-скоринг кандидатов по рубрике (профпригодность)",
  },
  {
    name:        "sales-follow-up",
    endpoint:    "/api/cron/sales-follow-up",
    schedule:    "*/15 * * * *",
    description: "Отправляет дожимные касания лидам в воронке продаж",
  },
  {
    name:        "trash-cleanup",
    endpoint:    "/api/cron/trash-cleanup",
    schedule:    "0 0 * * *",
    description: "Удаляет вакансии/материалы/анкеты из корзины по истечении срока хранения (03:00 МСК)",
  },
  {
    name:        "yandex-direct-agent",
    endpoint:    "/api/cron/yandex-direct-agent",
    schedule:    "0 3,9,15,21 * * *",
    description: "AI-агент Яндекс.Директа: синк кампаний, статистики и автооптимизация",
  },
]
