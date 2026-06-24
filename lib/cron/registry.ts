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
    description: "Проверка истёкших триалов: перевод компаний из trial → expired",
  },
  {
    name: "flight-risk-alerts",
    endpoint: "/api/cron/flight-risk-alerts",
    schedule: null,
    description: "Алерты по рискам увольнения: уведомления при высоком/критическом риске",
  },
  {
    name: "follow-up",
    endpoint: "/api/cron/follow-up",
    schedule: "*/15 * * * *",
    description: "Дожим кандидатов: отправка follow_up_messages через hh-чат",
  },
  {
    name: "health-check",
    endpoint: "/api/cron/health-check",
    schedule: null,
    description: "Health-check критичных кронов: проверка свежести последних запусков",
  },
  {
    name: "hh-cleanup-stuck",
    endpoint: "/api/cron/hh-cleanup-stuck",
    schedule: null,
    description: "Очистка зависших hh-откликов: перевод orphaned-откликов в нужный статус",
  },
  {
    name: "hh-import",
    endpoint: "/api/cron/hh-import",
    schedule: "* * * * *",
    description: "Импорт откликов с hh.ru и обработка очереди (AI-скоринг, рассылки)",
  },
  {
    name: "hh-import-burst",
    endpoint: "/api/cron/hh-import-burst",
    schedule: null,
    description: "Пакетный импорт hh.ru: N итераций подряд (запускается по требованию из UI)",
  },
  {
    name: "hh-incoming-messages",
    endpoint: "/api/cron/hh-incoming-messages",
    schedule: "*/15 * * * *",
    description: "Входящие сообщения hh.ru: классификация ответов кандидатов, применение стоп-слов",
  },
  {
    name: "hh-token-refresh",
    endpoint: "/api/cron/hh-token-refresh",
    schedule: "0 5 * * *",
    description: "Обновление hh-токенов у дормантных компаний (только истёкшие токены)",
  },
  {
    name: "interview-reminders",
    endpoint: "/api/cron/interview-reminders",
    schedule: "0 * * * *",
    description: "Напоминания об интервью: уведомления HR и кандидатам за 24ч и 2ч до начала",
  },
  {
    name: "knowledge-freshness",
    endpoint: "/api/cron/knowledge-freshness",
    schedule: null,
    description: "Свежесть базы знаний: флагирование устаревших материалов, уведомления директорам",
  },
  {
    name: "knowledge-gaps",
    endpoint: "/api/cron/knowledge-gaps",
    schedule: null,
    description: "Пробелы базы знаний: еженедельный анализ неотвеченных вопросов + AI-рекомендации",
  },
  {
    name: "knowledge-progress",
    endpoint: "/api/cron/knowledge-progress",
    schedule: null,
    description: "Прогресс обучения: еженедельная сводка по назначениям (завершили/отстают/просрочили)",
  },
  {
    name: "knowledge-reminders",
    endpoint: "/api/cron/knowledge-reminders",
    schedule: null,
    description: "Напоминания об обучении: уведомление сотрудникам с дедлайном < 3 дней",
  },
  {
    name: "knowledge-review",
    endpoint: "/api/cron/knowledge-review",
    schedule: null,
    description: "Ревью материалов базы знаний: флагирование статей/презентаций по сроку/циклу",
  },
  {
    name: "pending-rejections",
    endpoint: "/api/cron/pending-rejections",
    schedule: "*/5 * * * *",
    description: "Отложенные отказы: отправка отказов кандидатам по расписанию вакансии",
  },
  {
    name: "prequalification",
    endpoint: "/api/cron/prequalification",
    schedule: "*/15 * * * *",
    description: "AI-предквалификация: таймауты, напоминания Д+1/Д+3 по pending-кандидатам",
  },
  {
    name: "pulse-alerts",
    endpoint: "/api/cron/pulse-alerts",
    schedule: null,
    description: "Алерты пульс-опросов: уведомления при низких баллах сотрудников",
  },
  {
    name: "recalculate-flight-risk",
    endpoint: "/api/cron/recalculate-flight-risk",
    schedule: null,
    description: "Пересчёт рисков увольнения по всем сотрудникам (пульс, адаптация, навыки)",
  },
  {
    name: "recalculate-integrator-levels",
    endpoint: "/api/cron/recalculate-integrator-levels",
    schedule: null,
    description: "Пересчёт уровней интеграторов по количеству клиентов",
  },
  {
    name: "rubric-score",
    endpoint: "/api/cron/rubric-score",
    schedule: "*/15 * * * *",
    description: "Авто-скоринг рубрикой: оценка неоценённых кандидатов по критериям рубрики",
  },
  {
    name: "trash-cleanup",
    endpoint: "/api/cron/trash-cleanup",
    schedule: "0 0 * * *",
    description: "Очистка корзины: жёсткое удаление вакансий/компаний/пользователей/счетов с истёкшим сроком",
  },
]
