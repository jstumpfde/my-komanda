// Курированный перечень ОСНОВНЫХ страниц/разделов проектов MarketRadar.
//
// Не автогенерируем из роутов: иначе в списке окажутся login, превью, [slug],
// public/* и прочая техническая мелочь. Здесь — только то, что даёт понимание
// «что это за проект», человеческими ярлыками. Ключ — это label проекта из
// REPOS (lib/dev-activity/config.ts), он же приходит в repoStates.
//
// Чистый модуль без node-импортов — безопасно тянуть в client-компонент.

export interface ProjectPage {
  /** Человеческий ярлык раздела/страницы. */
  label: string
  /** Маршрут (или краткое тех-описание для не-веб частей). */
  path: string
  /** Необязательная группа — рендерится подзаголовком. */
  group?: string
}

// market-radar (прод) и market-radar-staging — одно и то же приложение.
const MARKET_RADAR: ProjectPage[] = [
  // Сайт / лендинг
  { group: "Сайт",     label: "Главная (лендинг)",     path: "/" },
  { group: "Сайт",     label: "Тарифы",                path: "/pricing" },
  { group: "Сайт",     label: "Каталог приложений",    path: "/apps" },
  { group: "Сайт",     label: "Экспресс-отчёт",        path: "/express-report" },
  { group: "Сайт",     label: "Блог",                  path: "/blog" },
  { group: "Сайт",     label: "Глоссарий",             path: "/glossary" },
  // Кабинеты
  { group: "Кабинеты", label: "Кабинет клиента",       path: "/main" },
  { group: "Кабинеты", label: "Кабинет партнёра",      path: "/partner" },
  { group: "Кабинеты", label: "Кабинет интегратора",   path: "/integrator" },
  { group: "Кабинеты", label: "Контент-фабрика",       path: "/content-factory" },
  { group: "Кабинеты", label: "Дашборд владельца",     path: "/owner-dashboard" },
  // Админка
  { group: "Админка",  label: "Дашборд",               path: "/admin/dashboard" },
  { group: "Админка",  label: "Лиды",                  path: "/admin/leads" },
  { group: "Админка",  label: "Партнёры",              path: "/admin/partners" },
  { group: "Админка",  label: "Платежи",               path: "/admin/payments" },
  { group: "Админка",  label: "Тарифы",                path: "/admin/pricing" },
  { group: "Админка",  label: "Рефералы",              path: "/admin/referrals" },
  { group: "Админка",  label: "Продукты",              path: "/admin/products" },
  { group: "Админка",  label: "AI-монитор",            path: "/admin/ai-monitor" },
  { group: "Админка",  label: "Call-agent (тенанты, тарифы, промо…)", path: "/admin/call-agent" },
  { group: "Админка",  label: "Leadgen",               path: "/admin/leadgen" },
  { group: "Админка",  label: "Parser",                path: "/admin/parser" },
]

const LEADGEN: ProjectPage[] = [
  { label: "Дашборд",     path: "/dashboard" },
  { label: "Лиды",        path: "/leads" },
  { label: "Кампании",    path: "/campaigns" },
  { label: "Воронки",     path: "/funnels" },
  { label: "Источники",   path: "/sources" },
  { label: "Импорты",     path: "/imports" },
  { label: "Сообщения",   path: "/messages" },
  { label: "События",     path: "/events" },
  { label: "Теги",        path: "/tags" },
  { label: "Настройки",   path: "/settings" },
]

const CALL_AGENT: ProjectPage[] = [
  { label: "Дашборд",            path: "/dashboard" },
  { label: "Звонки",             path: "/calls" },
  { label: "Клиенты",            path: "/clients" },
  { label: "Очередь",            path: "/queue" },
  { label: "CRM-журнал",         path: "/crm-log" },
  { label: "Рейтинг",            path: "/leaderboard" },
  { label: "Отчёты",             path: "/reports" },
  { label: "Расхождения",        path: "/discrepancies" },
  { label: "Мои",                path: "/my" },
  { label: "Заявки на онбординг", path: "/onboarding-requests" },
  { label: "Настройки",          path: "/settings" },
]

const PARSER: ProjectPage[] = [
  { label: "Панель парсера", path: "/ (одностраничный сервис сбора данных)" },
]

// Telegram-бот на Python — веб-страниц нет, перечисляем основные части кода.
const BOT: ProjectPage[] = [
  { label: "Telegram-бот (хэндлеры, клавиатуры, состояния)", path: "app/bot/" },
  { label: "Веб-отчёт",            path: "app/web/routes_report.py" },
  { label: "Платежи (YooKassa)",   path: "app/web/routes_yookassa.py" },
  { label: "Анализатор",           path: "app/analyzer.py" },
  { label: "Планировщик задач",    path: "app/scheduler.py" },
]

// Ключи — это label проекта из REPOS.
export const PROJECT_PAGES: Record<string, ProjectPage[]> = {
  "Market Radar": MARKET_RADAR,
  "MR staging":   MARKET_RADAR,
  "Leadgen":      LEADGEN,
  "Call-agent":   CALL_AGENT,
  "Parser":       PARSER,
  "Bot":          BOT,
}

export function pagesForProject(label: string): ProjectPage[] {
  return PROJECT_PAGES[label] ?? []
}
