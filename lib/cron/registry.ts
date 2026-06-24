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
    description: "Адаптационные планы: отправка шагов текущего дня, продвижение по дням",
  },
  {
    name: "ai-chatbot-watcher",
    endpoint: "/api/cron/ai-chatbot-watcher",
    schedule: "0 * * * *",
    description: "Аудит AI чат-бота: периодическая проверка последних сообщений по всем вакансиям",
  },
  {
    name: "auto-invoices",
    endpoint: "/api/cron/auto-invoices",
    schedule: "0 6 * * *",
    description: "Авто-выставление счетов за 7 дней до окончания оплаченного периода",
  },
  {
    name: "check-subscriptions",
    endpoint: "/api/cron/check-subscriptions",
    schedule: null,
    description: "Проверка истёкших триалов: переводит компании из trial в expired",
  },
  {
    name: "flight-risk-alerts",
    endpoint: "/api/cron/flight-risk-alerts",
    schedule: null,
    description: "Уведомления о высоком риске увольнения сотрудников (high/critical)",
  },
  {
    name: "follow-up",
    endpoint: "/api/cron/follow-up",
    schedule: null,
    description: "Дожим кандидатов: отправка касаний из follow_up_messages в hh-чат",
  },
  {
    name: "health-check",
    endpoint: "/api/cron/health-check",
    schedule: null,
    description: "Мониторинг работоспособности критичных кронов по таблице cron_runs",
  },
  {
    name: "hh-cleanup-stuck",
    endpoint: "/api/cron/hh-cleanup-stuck",
    schedule: null,
    description: "Очистка зависших hh_responses: переводит в orphaned отклики терминальных кандидатов",
  },
  {
    name: "hh-import",
    endpoint: "/api/cron/hh-import",
    schedule: "*/5 * * * *",
    description: "Импорт новых откликов с hh.ru и запуск очереди авто-обработки",
  },
  {
    name: "hh-import-burst",
    endpoint: "/api/cron/hh-import-burst",
    schedule: null,
    description: "Пакетный режим импорта hh: N итераций с задержкой (для кнопки «Разобрать всё»)",
  },
  {
    name: "hh-incoming-messages",
    endpoint: "/api/cron/hh-incoming-messages",
    schedule: "*/15 * * * *",
    description: "Входящие сообщения hh: классификация и обработка ответов кандидатов",
  },
  {
    name: "hh-token-refresh",
    endpoint: "/api/cron/hh-token-refresh",
    schedule: "0 5 * * *",
    description: "Обновление истёкших hh-токенов у дормантных компаний",
  },
  {
    name: "hh-vacancy-sync",
    endpoint: "/api/cron/hh-vacancy-sync",
    schedule: "30 2 * * *",
    description: "Синхронизация статуса вакансий с hh.ru (archived, hh_expires_at)",
  },
  {
    name: "interview-reminders",
    endpoint: "/api/cron/interview-reminders",
    schedule: null,
    description: "Напоминания о предстоящих интервью кандидатам и HR",
  },
  {
    name: "knowledge-freshness",
    endpoint: "/api/cron/knowledge-freshness",
    schedule: null,
    description: "Актуальность базы знаний: флаг устаревших/требующих проверки материалов",
  },
  {
    name: "knowledge-gaps",
    endpoint: "/api/cron/knowledge-gaps",
    schedule: null,
    description: "Пробелы в базе знаний: еженедельный AI-анализ неотвеченных вопросов сотрудников",
  },
  {
    name: "knowledge-progress",
    endpoint: "/api/cron/knowledge-progress",
    schedule: null,
    description: "Прогресс обучения: еженедельная сводка по завершённым/отстающим назначениям",
  },
  {
    name: "knowledge-reminders",
    endpoint: "/api/cron/knowledge-reminders",
    schedule: null,
    description: "Напоминания об обучении: уведомления сотрудникам с дедлайном < 3 дней",
  },
  {
    name: "knowledge-review",
    endpoint: "/api/cron/knowledge-review",
    schedule: null,
    description: "Проверка материалов: флаг статей и презентаций с истекающим validity или review-циклом",
  },
  {
    name: "pending-rejections",
    endpoint: "/api/cron/pending-rejections",
    schedule: null,
    description: "Отложенные отказы: отправка накопленных rejections кандидатам через hh",
  },
  {
    name: "prequalification",
    endpoint: "/api/cron/prequalification",
    schedule: "*/15 * * * *",
    description: "Предквалификация: напоминания (Д+1, Д+3) и fallback-финализация по таймауту",
  },
  {
    name: "pulse-alerts",
    endpoint: "/api/cron/pulse-alerts",
    schedule: null,
    description: "Пульс-алерты: уведомления о низких баллах сотрудников в пульс-опросах",
  },
  {
    name: "recalculate-flight-risk",
    endpoint: "/api/cron/recalculate-flight-risk",
    schedule: null,
    description: "Пересчёт risk-score увольнения по пульсу, адаптации, навыкам, обучению",
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
    schedule: null,
    description: "Авто-скоринг кандидатов по рубрике вакансии (AI-оценка резюме)",
  },
  {
    name: "sales-follow-up",
    endpoint: "/api/cron/sales-follow-up",
    schedule: null,
    description: "Дожим продаж: автоматические follow-up сообщения лидам через заданный интервал",
  },
  {
    name: "trash-cleanup",
    endpoint: "/api/cron/trash-cleanup",
    schedule: "0 0 * * *",
    description: "Авто-удаление вакансий из корзины по истечении trash_retention_days",
  },
]
