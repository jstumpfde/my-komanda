// Единое дерево навигации админ-панели — источник правды для ДВУХ обвесов:
//   1) вертикальный сайдбар (components/admin/admin-nav.tsx);
//   2) горизонтальные табы (components/admin/admin-category-tabs.tsx) — показывают
//      пункты ТЕКУЩЕЙ категории, ЕСЛИ их больше одного.
// Большинство пунктов вынесены в сайдбар прямыми ссылками (решение Юрия 17.06:
// «вынести в сайдбар» — Роли, Присутствие, AI-мониторинг, Юлия, Запросы, Партнёры,
// Рефералы). Один пункт = прямая ссылка (табов нет). Группа «Платформа» собирает
// редкие служебные/инфраструктурные страницы под табы.

import {
  LayoutDashboard, Building2, Package, Library, ShieldAlert, Shield, Handshake,
  Inbox, Bot, BookOpen, Activity, Wrench, Palette, Sparkles, UserPlus, Ticket,
  GitCommitHorizontal, Briefcase, MessageSquare, Repeat,
  type LucideIcon,
} from "lucide-react"

export interface AdminNavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface AdminNavCategory {
  title: string
  icon: LucideIcon
  items: AdminNavItem[]
}

export const ADMIN_NAV_TREE: AdminNavCategory[] = [
  { title: "Дашборд",          icon: LayoutDashboard, items: [{ label: "Дашборд",          href: "/admin/dashboard",            icon: LayoutDashboard }] },
  { title: "Dev-активность",   icon: GitCommitHorizontal, items: [{ label: "Dev-активность", href: "/admin/dev-activity",         icon: GitCommitHorizontal }] },
  { title: "Компании",         icon: Building2,       items: [{ label: "Компании",         href: "/admin/clients",              icon: Building2 }] },
  { title: "Вакансии",         icon: Briefcase,      items: [{ label: "Вакансии",         href: "/admin/vacancies",            icon: Briefcase }] },
  { title: "Запросы на email", icon: Inbox,           items: [{ label: "Запросы на email", href: "/admin/requests",             icon: Inbox }] },
  { title: "Партнёры",         icon: Handshake,       items: [{ label: "Партнёры",         href: "/admin/integrators",          icon: Handshake }] },
  { title: "Рефералы",         icon: UserPlus,        items: [{ label: "Рефералы",         href: "/admin/referrals",            icon: UserPlus }] },
  { title: "Приглашения",      icon: Ticket,          items: [{ label: "Приглашения",      href: "/admin/invites",              icon: Ticket }] },
  { title: "Тарифы и модули",  icon: Package,         items: [{ label: "Тарифы и модули",  href: "/admin/plans",                icon: Package }] },
  { title: "Шаблоны воронок",  icon: Library,         items: [{ label: "Шаблоны воронок",  href: "/admin/platform/templates",   icon: Library }] },
  { title: "Юлия",             icon: Bot,             items: [{ label: "Юлия",             href: "/admin/platform/yulia",       icon: Bot }] },
  { title: "AI-мониторинг",    icon: Bot,             items: [{ label: "AI-мониторинг",    href: "/admin/platform/companies",   icon: Bot }] },
  { title: "AI вакансии",      icon: BookOpen,        items: [{ label: "AI вакансии",      href: "/admin/platform/vacancies",   icon: BookOpen }] },
  { title: "Роли и доступ",    icon: Shield,          items: [{ label: "Роли и доступ",    href: "/admin/roles",                icon: Shield }] },
  { title: "Присутствие",      icon: Activity,        items: [{ label: "Присутствие",      href: "/admin/platform/presence",    icon: Activity }] },
  { title: "Брендинг и SEO",   icon: Palette,         items: [{ label: "Брендинг и SEO",   href: "/admin/platform/branding",    icon: Palette }] },
  {
    title: "Платформа",
    icon: ShieldAlert,
    items: [
      { label: "Emergency",     href: "/admin/platform/emergency",  icon: ShieldAlert },
      { label: "Логи действий", href: "/admin/platform/logs",       icon: Activity },
      { label: "Миграции",      href: "/admin/platform/migrations", icon: Wrench },
      { label: "Тексты сообщений", href: "/admin/platform/message-defaults", icon: MessageSquare },
      { label: "Шаблоны дожима", href: "/admin/platform/drip-templates", icon: Repeat },
      { label: "Тексты чат-бота", href: "/admin/platform/chatbot-defaults", icon: Bot },
      { label: "Демо-данные",   href: "/admin/platform/demo",       icon: Sparkles },
      { label: "Сроки / health", href: "/admin/platform/deadlines", icon: Activity },
      { label: "Cron-запуски",  href: "/admin/platform/cron",       icon: Wrench },
    ],
  },
]

// Совпадение пути с пунктом (для подсветки активного таба/категории).
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") return pathname === "/admin/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

// Категория, к которой относится текущий путь (по любому из её пунктов).
export function findActiveCategory(pathname: string): AdminNavCategory | undefined {
  return ADMIN_NAV_TREE.find((cat) => cat.items.some((it) => isNavItemActive(pathname, it.href)))
}
